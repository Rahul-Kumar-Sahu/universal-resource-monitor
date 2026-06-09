const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { JsonStore } = require("../src/server/store");

test("creates a project and accepts metrics only with its project key", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-store-"));
  const store = new JsonStore(path.join(directory, "store.json"));
  const created = store.createProject({
    name: "Clinic",
    environment: "Production",
    firstAgentName: "API Server",
    serviceUrl: "https://example.com/health",
  });

  assert.equal(created.project.name, "Clinic");
  assert.equal(created.project.serviceUrl, "https://example.com/health");
  assert.ok(created.projectKey.startsWith("prj_"));
  assert.equal(store.ingest("wrong-key", { agentName: "API", metrics: {} }), null);

  const result = store.ingest(created.projectKey, {
    agentName: "API Server",
    metrics: { cpu: { usagePercent: 12 } },
    services: [],
  });

  assert.equal(result.projectId, created.project.id);
  const projects = store.listProjects();
  assert.equal(projects[0].agents[0].latestSnapshot.metrics.cpu.usagePercent, 12);
  assert.equal("keyHash" in projects[0], false);
});

test("restores persisted projects and snapshots", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-store-"));
  const filePath = path.join(directory, "store.json");
  const firstStore = new JsonStore(filePath);
  const created = firstStore.createProject({
    name: "Office",
    environment: "Staging",
    firstAgentName: "",
  });
  firstStore.ingest(created.projectKey, {
    agentName: "Worker",
    metrics: { memory: { usedPercent: 44 } },
  });

  const restoredStore = new JsonStore(filePath);
  assert.equal(restoredStore.listProjects()[0].name, "Office");
  assert.equal(
    restoredStore.listProjects()[0].agents[0].latestSnapshot.metrics.memory
      .usedPercent,
    44,
  );
});

test("deletes a project with its agents, snapshots and project key access", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-store-"));
  const store = new JsonStore(path.join(directory, "store.json"));
  const created = store.createProject({
    name: "Temporary",
    environment: "Development",
    firstAgentName: "Local Server",
  });
  store.ingest(created.projectKey, {
    agentName: "Local Server",
    metrics: { cpu: { usagePercent: 10 } },
  });

  assert.equal(store.deleteProject(created.project.id), true);
  assert.equal(store.listProjects().length, 0);
  assert.equal(store.state.agents.length, 0);
  assert.equal(store.state.snapshots.length, 0);
  assert.equal(store.findProjectBySecret(created.projectKey), undefined);
  assert.equal(store.deleteProject(created.project.id), false);
});
