const state = {
  adminToken: localStorage.getItem("monitorAdminToken") || "",
  projects: [],
};

const elements = {
  connectionBadge: document.querySelector("#connectionBadge"),
  projectGrid: document.querySelector("#projectGrid"),
  emptyState: document.querySelector("#emptyState"),
  projectCount: document.querySelector("#projectCount"),
  onlineCount: document.querySelector("#onlineCount"),
  warningCount: document.querySelector("#warningCount"),
  tokenDialog: document.querySelector("#tokenDialog"),
  projectDialog: document.querySelector("#projectDialog"),
  keyDialog: document.querySelector("#keyDialog"),
  adminTokenInput: document.querySelector("#adminTokenInput"),
  projectKeyOutput: document.querySelector("#projectKeyOutput"),
  agentConfigOutput: document.querySelector("#agentConfigOutput"),
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatPercent = (value) =>
  Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "-";

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(1)} ${units[index]}`;
};

const getAgentState = (agent) => {
  if (!agent.latestSnapshot || !agent.lastSeenAt) return "offline";
  const ageSeconds = (Date.now() - new Date(agent.lastSeenAt).getTime()) / 1000;
  if (ageSeconds > 90) return "offline";

  const metrics = agent.latestSnapshot.metrics || {};
  const services = agent.latestSnapshot.services || [];
  const warning =
    Number(metrics.cpu?.usagePercent) >= 80 ||
    Number(metrics.memory?.usedPercent) >= 85 ||
    Number(metrics.disk?.usedPercent) >= 80 ||
    services.some((service) => !service.healthy);
  return warning ? "warning" : "online";
};

const relativeTime = (dateValue) => {
  if (!dateValue) return "Never reported";
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(dateValue).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
};

const render = () => {
  const allAgents = state.projects.flatMap((project) => project.agents || []);
  const statuses = allAgents.map(getAgentState);
  elements.projectCount.textContent = state.projects.length;
  elements.onlineCount.textContent = statuses.filter(
    (status) => status === "online",
  ).length;
  elements.warningCount.textContent = statuses.filter(
    (status) => status === "warning",
  ).length;
  elements.emptyState.classList.toggle("visible", state.projects.length === 0);

  elements.projectGrid.innerHTML = state.projects
    .map((project) => {
      const agents = project.agents || [];
      return `
        <article class="project-card">
          <header class="project-header">
            <div>
              <h3>${escapeHtml(project.name)}</h3>
              <p>${escapeHtml(project.environment)} · ${agents.length} server(s)</p>
            </div>
            <button
              type="button"
              class="button danger"
              data-delete-project="${escapeHtml(project.id)}"
              data-project-name="${escapeHtml(project.name)}"
            >
              Remove
            </button>
          </header>
          <div class="agent-grid">
            ${
              agents.length
                ? agents.map(renderAgent).join("")
                : '<div class="agent-card"><p class="agent-meta">Agent has not connected yet.</p></div>'
            }
          </div>
        </article>
      `;
    })
    .join("");
};

elements.projectGrid.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-project]");
  if (!deleteButton) return;

  const projectId = deleteButton.dataset.deleteProject;
  const projectName = deleteButton.dataset.projectName;
  const confirmed = window.confirm(
    `Remove "${projectName}"? Is project ke agents aur purani metrics bhi delete ho jayengi.`,
  );
  if (!confirmed) return;

  deleteButton.disabled = true;
  deleteButton.textContent = "Removing...";
  try {
    await apiRequest(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    });
    await refreshProjects();
  } catch (error) {
    deleteButton.disabled = false;
    deleteButton.textContent = "Remove";
    alert(error.message);
  }
});

const renderAgent = (agent) => {
  const status = getAgentState(agent);
  const snapshot = agent.latestSnapshot;
  const metrics = snapshot?.metrics || {};
  const projectMetrics = metrics.project || null;
  const services = snapshot?.services || [];
  const trackedPorts = projectMetrics?.trackedPorts || [];
  return `
    <section class="agent-card">
      <div class="agent-title">
        <h4>${escapeHtml(agent.name)}</h4>
        <span class="badge ${status}">${status}</span>
      </div>
      <p class="agent-meta">${escapeHtml(metrics.hostname || "Waiting for first report")} · ${relativeTime(agent.lastSeenAt)}</p>
      ${
        projectMetrics
          ? `
            <div class="usage-section project-usage">
              <div class="usage-heading">
                <strong>Project usage</strong>
                <span>${projectMetrics.processCount || 0} process(es)${trackedPorts.length ? ` · port ${trackedPorts.join(", ")}` : ""}</span>
              </div>
              <div class="metric-grid">
                <div class="metric"><strong>${formatPercent(projectMetrics.cpu?.usagePercent)}</strong><span>CPU share · ${formatPercent(projectMetrics.cpu?.activityMonitorPercent)} in Activity Monitor</span></div>
                <div class="metric"><strong>${formatPercent(projectMetrics.memory?.usedPercent)}</strong><span>RAM · ${formatBytes(projectMetrics.memory?.usedBytes)}</span></div>
                <div class="metric"><strong>${formatPercent(projectMetrics.disk?.usedPercent)}</strong><span>Project files · ${formatBytes(projectMetrics.disk?.usedBytes)}</span></div>
              </div>
              ${
                projectMetrics.processCount
                  ? ""
                  : '<p class="metric-note warning-text">No listening project process found. Check the configured local service port.</p>'
              }
            </div>
          `
          : '<p class="metric-note warning-text">Project metrics unavailable. Add projectPath and update the agent.</p>'
      }
      <div class="usage-section host-usage">
        <div class="usage-heading">
          <strong>Mac / host usage</strong>
          <span>Whole machine</span>
        </div>
        <div class="metric-grid">
          <div class="metric"><strong>${formatPercent(metrics.cpu?.usagePercent)}</strong><span>CPU</span></div>
          <div class="metric"><strong>${formatPercent(metrics.memory?.usedPercent)}</strong><span>RAM · ${formatBytes(metrics.memory?.usedBytes)} / ${formatBytes(metrics.memory?.totalBytes)}</span></div>
          <div class="metric"><strong>${formatPercent(metrics.disk?.usedPercent)}</strong><span>Disk · ${formatBytes(metrics.disk?.usedBytes)} / ${formatBytes(metrics.disk?.totalBytes)}</span></div>
        </div>
      </div>
      <div class="service-list">
        ${
          services.length
            ? services
                .map(
                  (service) => `
                    <div class="service-row">
                      <span>${escapeHtml(service.name)}</span>
                      <span class="${service.healthy ? "online" : "error"}">
                        ${service.healthy ? "Healthy" : "Failed"} · ${service.responseTimeMs ?? "-"} ms
                      </span>
                    </div>
                  `,
                )
                .join("")
            : '<div class="service-row"><span>No service checks configured</span></div>'
        }
      </div>
    </section>
  `;
};

const apiRequest = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.adminToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "Request failed");
  return body;
};

const refreshProjects = async () => {
  if (!state.adminToken) {
    elements.connectionBadge.className = "badge neutral";
    elements.connectionBadge.textContent = "Admin token required";
    elements.tokenDialog.showModal();
    return;
  }

  try {
    const body = await apiRequest("/api/projects");
    state.projects = body.data;
    elements.connectionBadge.className = "badge online";
    elements.connectionBadge.textContent = "Connected";
    render();
  } catch (error) {
    elements.connectionBadge.className = "badge error";
    elements.connectionBadge.textContent = error.message;
  }
};

document.querySelector("#settingsButton").addEventListener("click", () => {
  elements.adminTokenInput.value = state.adminToken;
  elements.tokenDialog.showModal();
});

document.querySelector("#saveTokenButton").addEventListener("click", (event) => {
  event.preventDefault();
  state.adminToken = elements.adminTokenInput.value.trim();
  localStorage.setItem("monitorAdminToken", state.adminToken);
  elements.tokenDialog.close();
  refreshProjects();
});

const openProjectDialog = () => elements.projectDialog.showModal();
document.querySelector("#addProjectButton").addEventListener("click", openProjectDialog);
document.querySelector("[data-open-project]").addEventListener("click", openProjectDialog);
document.querySelector("[data-close-project]").addEventListener("click", () => {
  elements.projectDialog.close();
});
document.querySelector("[data-close-key]").addEventListener("click", () => {
  elements.keyDialog.close();
});
document.querySelector("#refreshButton").addEventListener("click", refreshProjects);

document.querySelector("#projectForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const projectInput = Object.fromEntries(formData.entries());
  try {
    const body = await apiRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify(projectInput),
    });
    elements.projectDialog.close();
    form.reset();
    elements.projectKeyOutput.textContent = body.data.projectKey;
    elements.agentConfigOutput.textContent = JSON.stringify(
      {
        serverUrl: window.location.origin,
        projectKey: body.data.projectKey,
        agentName:
          projectInput.firstAgentName || `${projectInput.name} Server`,
        intervalSeconds: 30,
        requestTimeoutMs: 5000,
        diskPath: "/",
        projectPath: "..",
        processPorts: [],
        services: projectInput.serviceUrl
          ? [
              {
                name: `${projectInput.name} Health`,
                url: projectInput.serviceUrl,
              },
            ]
          : [],
      },
      null,
      2,
    );
    elements.keyDialog.showModal();
    await refreshProjects();
  } catch (error) {
    alert(error.message);
  }
});

document.querySelector("#copyKeyButton").addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.projectKeyOutput.textContent);
  document.querySelector("#copyKeyButton").textContent = "Copied";
});

document.querySelector("#copyConfigButton").addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.agentConfigOutput.textContent);
  document.querySelector("#copyConfigButton").textContent = "Copied";
});

refreshProjects();
setInterval(refreshProjects, 15000);
