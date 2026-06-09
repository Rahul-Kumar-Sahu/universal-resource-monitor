const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

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
    const totalBytes = Number(columns[1]) * 1024;
    const usedBytes = Number(columns[2]) * 1024;
    const availableBytes = Number(columns[3]) * 1024;

    return {
      path: diskPath,
      supported: true,
      totalBytes,
      usedBytes,
      availableBytes,
      usedPercent: totalBytes
        ? Number(((usedBytes / totalBytes) * 100).toFixed(2))
        : 0,
    };
  } catch (error) {
    return {
      path: diskPath,
      supported: false,
      message: error.message,
    };
  }
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
  const [cpuPercent, disk, services] = await Promise.all([
    collectCpuPercent(),
    collectDisk(config.diskPath),
    Promise.all(
      (config.services || []).map((service) =>
        checkService(service, config.requestTimeoutMs),
      ),
    ),
  ]);
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;

  return {
    agentName: config.agentName,
    agentVersion: "0.1.0",
    metrics: {
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
      memory: {
        totalBytes: totalMemoryBytes,
        usedBytes: usedMemoryBytes,
        freeBytes: freeMemoryBytes,
        usedPercent: totalMemoryBytes
          ? Number(((usedMemoryBytes / totalMemoryBytes) * 100).toFixed(2))
          : 0,
      },
      disk,
    },
    services,
  };
};

module.exports = {
  checkService,
  collectCpuPercent,
  collectDisk,
  collectMetrics,
};
