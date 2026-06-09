const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  collectDirectorySize,
  getLocalServicePorts,
} = require("../src/agent/collector");

test("extracts only local service ports for process tracking", () => {
  assert.deepEqual(
    getLocalServicePorts([
      { url: "http://127.0.0.1:4000/health" },
      { url: "http://localhost:3000" },
      { url: "https://example.com:8443/health" },
      { url: "not-a-url" },
    ]),
    [4000, 3000],
  );
});

test(
  "measures the monitored project directory",
  { skip: process.platform === "win32" },
  async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "monitor-project-size-"),
    );
    fs.writeFileSync(path.join(directory, "payload.bin"), Buffer.alloc(4096));

    const result = await collectDirectorySize(directory);

    assert.equal(result.supported, true);
    assert.equal(result.path, directory);
    assert.ok(result.usedBytes >= 4096);
  },
);
