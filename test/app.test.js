const assert = require("node:assert/strict");
const test = require("node:test");
const { getBearerToken, validateMetricsPayload } = require("../src/server/app");

test("reads bearer token", () => {
  assert.equal(
    getBearerToken({ headers: { authorization: "Bearer secret" } }),
    "secret",
  );
  assert.equal(getBearerToken({ headers: {} }), "");
});

test("validates required metrics payload fields", () => {
  assert.equal(validateMetricsPayload({}), "agentName is required");
  assert.equal(
    validateMetricsPayload({ agentName: "Server" }),
    "metrics is required",
  );
  assert.equal(
    validateMetricsPayload({ agentName: "Server", metrics: {} }),
    null,
  );
});
