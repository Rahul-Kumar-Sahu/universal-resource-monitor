const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const roundPercent = (value) => Number(Number(value || 0).toFixed(2));

const readCpuTimes = () =>
  os.cpus().reduce(
    (totals, cpu) => {
      const idle = cpu.times.idle;
      const total = Object.values(cpu.times).reduce(
        (sum, value) => sum + value,
        0,
      );
      totals.idle += idle;
      totals.total += total;
      return totals;
    },
    { idle: 0, total: 0 },
  );

const collectCpuPercent = async (sampleMilliseconds = 250) => {
  const before = readCpuTimes();
  await sleep(sampleMilliseconds);
  const after = readCpuTimes();
  const totalDelta = after.total - before.total;
  const idleDelta = after.idle - before.idle;

  if (totalDelta <= 0) {
    return 0;
  }

  return Number((((totalDelta - idleDelta) / totalDelta) * 100).toFixed(2));
};

const collectDisk = async (diskPath = "/") => {
  if (process.platform === "win32") {
    return {
      path: diskPath,
      supported: false,
      message: "Windows disk collection will be added with the Go agent",
    };
  }

  try {
    const { stdout } = await execFileAsync("df", ["-Pk", diskPath]);
    const lines = stdout.trim().split("\n");
    const columns = lines.at(-1).trim().split(/\s+/);
    const usedBytes = Number(columns[2]) * 1024;
    const availableBytes = Number(columns[3]) * 1024;
    // APFS reports shared-container capacity, where the first df size column
    // does not reliably match used + available for an individual volume.
    const totalBytes = usedBytes + availableBytes;

    return {
      path: diskPath,
      supported: true,
      totalBytes,
      usedBytes,
      availableBytes,
      usedPercent: totalBytes ? roundPercent((usedBytes / totalBytes) * 100) : 0,
    };
  } catch (error) {
    return {
      path: diskPath,
      supported: false,
      message: error.message,
    };
  }
};

const collectMemory = async () => {
  const totalBytes = os.totalmem();

  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("vm_stat");
      const pageSize = Number(
        stdout.match(/page size of (\d+) bytes/i)?.[1] || 4096,
      );
      const readPages = (label) =>
        Number(
          stdout.match(new RegExp(`${label}:\\s+(\\d+)`, "i"))?.[1] || 0,
        );
      const usedPages =
        readPages("Pages active") +
        readPages("Pages wired down") +
        readPages("Pages occupied by compressor");
      const usedBytes = Math.min(usedPages * pageSize, totalBytes);

      return {
        totalBytes,
        usedBytes,
        freeBytes: Math.max(totalBytes - usedBytes, 0),
        usedPercent: totalBytes
          ? roundPercent((usedBytes / totalBytes) * 100)
          : 0,
        source: "vm_stat",
      };
    } catch {
      // Fall through to the portable calculation.
    }
  }

  const freeMemoryBytes = os.freemem();
  const usedBytes = totalBytes - freeMemoryBytes;
  return {
    totalBytes,
    usedBytes,
    freeBytes: freeMemoryBytes,
    usedPercent: totalBytes
      ? roundPercent((usedBytes / totalBytes) * 100)
      : 0,
    source: "os",
  };
};

const getLocalServicePorts = (services = []) => {
  const ports = new Set();

  for (const service of services) {
    try {
      const url = new URL(service.url);
      if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) continue;
      const port = Number(
        url.port || (url.protocol === "https:" ? 443 : 80),
      );
      if (port > 0 && port <= 65535) ports.add(port);
    } catch {
      // Invalid service URLs are reported by the health check itself.
    }
  }

  return [...ports];
};

const findListeningPids = async (ports) => {
  if (process.platform === "win32" || ports.length === 0) return [];
  const pids = new Set();

  await Promise.all(
    ports.map(async (port) => {
      try {
        const { stdout } = await execFileAsync("lsof", [
          "-nP",
          `-iTCP:${port}`,
          "-sTCP:LISTEN",
          "-t",
        ]);
        stdout
          .trim()
          .split(/\s+/)
          .map(Number)
          .filter(Number.isInteger)
          .forEach((pid) => pids.add(pid));
      } catch {
        // A missing listener simply means no process is currently tracked.
      }
    }),
  );

  return [...pids];
};

const collectProcessUsage = async (pids) => {
  if (process.platform === "win32" || pids.length === 0) {
    return { processes: [], cpuPercent: 0, memoryBytes: 0 };
  }

  try {
    const { stdout } = await execFileAsync("ps", [
      "-p",
      pids.join(","),
      "-o",
      "pid=,%cpu=,rss=,comm=",
    ]);
    const processes = stdout
      .trim()
      .split("\n")
      .map((line) => line.trim().match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/))
      .filter(Boolean)
      .map((match) => ({
        pid: Number(match[1]),
        cpuPercent: Number(match[2]),
        memoryBytes: Number(match[3]) * 1024,
        command: match[4],
      }));

    return {
      processes,
      cpuPercent: roundPercent(
        processes.reduce((sum, item) => sum + item.cpuPercent, 0),
      ),
      memoryBytes: processes.reduce(
        (sum, item) => sum + item.memoryBytes,
        0,
      ),
    };
  } catch {
    return { processes: [], cpuPercent: 0, memoryBytes: 0 };
  }
};

const collectDirectorySize = async (projectPath) => {
  if (!projectPath) return { supported: false, message: "projectPath not set" };
  if (process.platform === "win32") {
    return {
      path: projectPath,
      supported: false,
      message: "Project disk usage is not available on Windows yet",
    };
  }

  try {
    const { stdout } = await execFileAsync("du", ["-sk", projectPath]);
    return {
      path: projectPath,
      supported: true,
      usedBytes: Number(stdout.trim().split(/\s+/)[0]) * 1024,
    };
  } catch (error) {
    return { path: projectPath, supported: false, message: error.message };
  }
};

const collectProjectMetrics = async (config, hostMetrics) => {
  const ports = [
    ...new Set([
      ...(config.processPorts || []).map(Number),
      ...getLocalServicePorts(config.services),
    ]),
  ].filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);
  const [pids, disk] = await Promise.all([
    findListeningPids(ports),
    collectDirectorySize(config.projectPath),
  ]);
  const usage = await collectProcessUsage(pids);
  const logicalCores = hostMetrics.cpu.logicalCores || 1;
  const totalMemoryBytes = hostMetrics.memory.totalBytes || 0;
  const totalDiskBytes = hostMetrics.disk.totalBytes || 0;

  return {
    trackedPorts: ports,
    processCount: usage.processes.length,
    processes: usage.processes,
    cpu: {
      activityMonitorPercent: usage.cpuPercent,
      usagePercent: roundPercent(usage.cpuPercent / logicalCores),
    },
    memory: {
      usedBytes: usage.memoryBytes,
      usedPercent: totalMemoryBytes
        ? roundPercent((usage.memoryBytes / totalMemoryBytes) * 100)
        : 0,
    },
    disk: {
      ...disk,
      usedPercent:
        disk.supported && totalDiskBytes
          ? roundPercent((disk.usedBytes / totalDiskBytes) * 100)
          : null,
    },
  };
};

const checkService = async (service, timeoutMs) => {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(service.url, {
      method: service.method || "GET",
      signal: controller.signal,
      headers: service.headers || {},
    });
    return {
      name: service.name,
      url: service.url,
      healthy: response.ok,
      statusCode: response.status,
      responseTimeMs: Math.round(performance.now() - startedAt),
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: service.name,
      url: service.url,
      healthy: false,
      statusCode: null,
      responseTimeMs: Math.round(performance.now() - startedAt),
      error: error.name === "AbortError" ? "Request timed out" : error.message,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const collectMetrics = async (config) => {
  const [cpuPercent, memory, disk, services] = await Promise.all([
    collectCpuPercent(),
    collectMemory(),
    collectDisk(config.diskPath),
    Promise.all(
      (config.services || []).map((service) =>
        checkService(service, config.requestTimeoutMs),
      ),
    ),
  ]);
  const hostMetrics = {
    collectedAt: new Date().toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
    architecture: os.arch(),
    uptimeSeconds: os.uptime(),
    cpu: {
      usagePercent: cpuPercent,
      logicalCores: os.cpus().length,
      model: os.cpus()[0]?.model || "Unknown",
      loadAverage: os.loadavg(),
    },
    memory,
    disk,
  };
  hostMetrics.project = await collectProjectMetrics(config, hostMetrics);

  return {
    agentName: config.agentName,
    agentVersion: "0.1.0",
    metrics: hostMetrics,
    services,
  };
};

module.exports = {
  checkService,
  collectCpuPercent,
  collectDirectorySize,
  collectDisk,
  collectMemory,
  collectMetrics,
  collectProcessUsage,
  getLocalServicePorts,
};
