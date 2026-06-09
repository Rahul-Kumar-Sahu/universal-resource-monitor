const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { loadEnvFile, parseEnvLine } = require("../src/shared/loadEnv");

test("parses env lines and ignores comments", () => {
  assert.deepEqual(parseEnvLine("PORT=8080"), {
    key: "PORT",
    value: "8080",
  });
  assert.deepEqual(parseEnvLine('TOKEN="secret value"'), {
    key: "TOKEN",
    value: "secret value",
  });
  assert.equal(parseEnvLine("# comment"), null);
});

test("loads missing environment values without overriding existing ones", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-env-"));
  const filePath = path.join(directory, ".env");
  fs.writeFileSync(filePath, "MONITOR_TEST_VALUE=from-file\n");

  delete process.env.MONITOR_TEST_VALUE;
  assert.equal(loadEnvFile(filePath), true);
  assert.equal(process.env.MONITOR_TEST_VALUE, "from-file");

  process.env.MONITOR_TEST_VALUE = "existing";
  loadEnvFile(filePath);
  assert.equal(process.env.MONITOR_TEST_VALUE, "existing");
  delete process.env.MONITOR_TEST_VALUE;
});
