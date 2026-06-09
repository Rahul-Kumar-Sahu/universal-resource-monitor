const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const hashSecret = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

const createProjectSecret = () => `prj_${crypto.randomBytes(24).toString("hex")}`;

class JsonStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.maxSnapshotsPerAgent = options.maxSnapshotsPerAgent || 240;
    this.state = {
      projects: [],
      agents: [],
      snapshots: [],
    };
    this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return;
    }

    const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    this.state.projects = Array.isArray(parsed.projects) ? parsed.projects : [];
    this.state.agents = Array.isArray(parsed.agents) ? parsed.agents : [];
    this.state.snapshots = Array.isArray(parsed.snapshots)
      ? parsed.snapshots
      : [];
  }

  persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.state, null, 2));
    fs.renameSync(temporaryPath, this.filePath);
  }

  createProject({ name, environment, firstAgentName, serviceUrl = "" }) {
    const now = new Date().toISOString();
    const projectKey = createProjectSecret();
    const project = {
      id: crypto.randomUUID(),
      name,
      environment,
      serviceUrl: serviceUrl || null,
      keyHash: hashSecret(projectKey),
      createdAt: now,
      updatedAt: now,
    };

    this.state.projects.push(project);

    if (firstAgentName) {
      this.state.agents.push({
        id: crypto.randomUUID(),
        projectId: project.id,
        name: firstAgentName,
        createdAt: now,
        lastSeenAt: null,
      });
    }

    this.persist();
    return {
      project: this.toPublicProject(project),
      projectKey,
    };
  }

  findProjectBySecret(projectKey) {
    const keyHash = hashSecret(projectKey);
    return this.state.projects.find((project) =>
      crypto.timingSafeEqual(
        Buffer.from(project.keyHash),
        Buffer.from(keyHash),
      ),
    );
  }

  ingest(projectKey, payload) {
    const project = this.findProjectBySecret(projectKey);
    if (!project) {
      return null;
    }

    const now = new Date().toISOString();
    const agentName = String(payload.agentName || "Unnamed Server").trim();
    let agent = this.state.agents.find(
      (item) => item.projectId === project.id && item.name === agentName,
    );

    if (!agent) {
      agent = {
        id: crypto.randomUUID(),
        projectId: project.id,
        name: agentName,
        createdAt: now,
        lastSeenAt: now,
      };
      this.state.agents.push(agent);
    } else {
      agent.lastSeenAt = now;
    }

    project.updatedAt = now;
    this.state.snapshots.push({
      id: crypto.randomUUID(),
      projectId: project.id,
      agentId: agent.id,
      receivedAt: now,
      metrics: payload.metrics,
      services: Array.isArray(payload.services) ? payload.services : [],
      agentVersion: payload.agentVersion || null,
    });

    const agentSnapshots = this.state.snapshots
      .filter((snapshot) => snapshot.agentId === agent.id)
      .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
    const removableIds = new Set(
      agentSnapshots
        .slice(this.maxSnapshotsPerAgent)
        .map((snapshot) => snapshot.id),
    );
    this.state.snapshots = this.state.snapshots.filter(
      (snapshot) => !removableIds.has(snapshot.id),
    );

    this.persist();
    return {
      projectId: project.id,
      agentId: agent.id,
      receivedAt: now,
    };
  }

  listProjects() {
    return this.state.projects.map((project) => {
      const agents = this.state.agents
        .filter((agent) => agent.projectId === project.id)
        .map((agent) => {
          const latestSnapshot = this.state.snapshots
            .filter((snapshot) => snapshot.agentId === agent.id)
            .sort((left, right) =>
              right.receivedAt.localeCompare(left.receivedAt),
            )[0];

          return {
            ...agent,
            latestSnapshot: latestSnapshot || null,
          };
        });

      return {
        ...this.toPublicProject(project),
        agents,
      };
    });
  }

  getProject(projectId) {
    return this.listProjects().find((project) => project.id === projectId);
  }

  deleteProject(projectId) {
    const projectIndex = this.state.projects.findIndex(
      (project) => project.id === projectId,
    );
    if (projectIndex === -1) {
      return false;
    }

    this.state.projects.splice(projectIndex, 1);
    this.state.agents = this.state.agents.filter(
      (agent) => agent.projectId !== projectId,
    );
    this.state.snapshots = this.state.snapshots.filter(
      (snapshot) => snapshot.projectId !== projectId,
    );
    this.persist();
    return true;
  }

  toPublicProject(project) {
    const { keyHash, ...publicProject } = project;
    return publicProject;
  }
}

module.exports = {
  JsonStore,
  hashSecret,
};
