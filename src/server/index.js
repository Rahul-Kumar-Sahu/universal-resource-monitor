const path = require("node:path");
const { createApp } = require("./app");
const { JsonStore } = require("./store");
const { loadEnvFile } = require("../shared/loadEnv");

loadEnvFile();

const port = Number(process.env.MONITOR_PORT || 8080);
const host = process.env.MONITOR_HOST || "0.0.0.0";
const adminToken = process.env.MONITOR_ADMIN_TOKEN;

if (!adminToken || adminToken.length < 12) {
  console.error(
    "MONITOR_ADMIN_TOKEN is required and must contain at least 12 characters.",
  );
  process.exit(1);
}

const store = new JsonStore(
  path.resolve(
    process.env.MONITOR_DATA_FILE ||
      path.join(__dirname, "../../data/store.json"),
  ),
);
const server = createApp({
  store,
  adminToken,
  publicDir: path.join(__dirname, "../../public"),
});

server.listen(port, host, () => {
  console.log(`Universal Resource Monitor: http://localhost:${port}`);
});
