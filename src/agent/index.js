const fs = require("node:fs");
const path = require("node:path");
const { collectMetrics } = require("./collector");

const getArgument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};

const configPath = path.resolve(
  getArgument("--config") || "monitor.config.json",
);
const runOnce = process.argv.includes("--once");

if (!fs.existsSync(configPath)) {
  console.error(`Agent config not found: ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const requiredFields = ["serverUrl", "projectKey", "agentName"];
const missingFields = requiredFields.filter(
  (field) => !String(config[field] || "").trim(),
);

if (missingFields.length > 0) {
  console.error(`Missing config fields: ${missingFields.join(", ")}`);
  process.exit(1);
}

config.intervalSeconds = Math.max(Number(config.intervalSeconds) || 30, 5);
config.requestTimeoutMs = Math.max(Number(config.requestTimeoutMs) || 5000, 500);
config.diskPath = config.diskPath || "/";
config.projectPath = config.projectPath
  ? path.resolve(path.dirname(configPath), config.projectPath)
  : null;
config.processPorts = Array.isArray(config.processPorts)
  ? config.processPorts
  : [];

const sendReport = async () => {
  const payload = await collectMetrics(config);
  const response = await fetch(
    `${String(config.serverUrl).replace(/\/$/, "")}/api/ingest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.projectKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.message || `Server returned ${response.status}`);
  }

  console.log(
    `[${new Date().toISOString()}] Metrics sent for ${config.agentName}`,
  );
};

const run = async () => {
  try {
    await sendReport();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${error.message}`);
  }

  if (!runOnce) {
    setTimeout(run, config.intervalSeconds * 1000);
  }
};

run();
