const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const JSON_LIMIT_BYTES = 1024 * 1024;

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
};

const readJson = (request) =>
  new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > JSON_LIMIT_BYTES) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });

const getBearerToken = (request) => {
  const authorization = String(request.headers.authorization || "");
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
};

const validateMetricsPayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return "Payload is required";
  }
  if (!payload.agentName || typeof payload.agentName !== "string") {
    return "agentName is required";
  }
  if (!payload.metrics || typeof payload.metrics !== "object") {
    return "metrics is required";
  }
  return null;
};

const serveStaticFile = (response, filePath, contentType) => {
  if (!fs.existsSync(filePath)) {
    sendJson(response, 404, { success: false, message: "Not found" });
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(filePath).pipe(response);
};

const createApp = ({ store, adminToken, publicDir }) =>
  http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const method = request.method || "GET";

    try {
      if (method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, {
          success: true,
          message: "Universal Resource Monitor is running",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/ingest") {
        const projectKey = getBearerToken(request);
        const payload = await readJson(request);
        const validationError = validateMetricsPayload(payload);

        if (!projectKey) {
          sendJson(response, 401, {
            success: false,
            message: "Project key is required",
          });
          return;
        }
        if (validationError) {
          sendJson(response, 400, {
            success: false,
            message: validationError,
          });
          return;
        }

        const result = store.ingest(projectKey, payload);
        if (!result) {
          sendJson(response, 401, {
            success: false,
            message: "Invalid project key",
          });
          return;
        }

        sendJson(response, 202, {
          success: true,
          message: "Metrics accepted",
          data: result,
        });
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        if (getBearerToken(request) !== adminToken) {
          sendJson(response, 401, {
            success: false,
            message: "Valid admin token is required",
          });
          return;
        }

        if (method === "GET" && url.pathname === "/api/projects") {
          sendJson(response, 200, {
            success: true,
            data: store.listProjects(),
          });
          return;
        }

        if (method === "POST" && url.pathname === "/api/projects") {
          const body = await readJson(request);
          const name = String(body.name || "").trim();
          const environment = String(body.environment || "Production").trim();
          const firstAgentName = String(body.firstAgentName || "").trim();
          const serviceUrl = String(body.serviceUrl || "").trim();

          if (!name) {
            sendJson(response, 400, {
              success: false,
              message: "Project name is required",
            });
            return;
          }
          if (serviceUrl) {
            try {
              const parsedServiceUrl = new URL(serviceUrl);
              if (!["http:", "https:"].includes(parsedServiceUrl.protocol)) {
                throw new Error("Unsupported protocol");
              }
            } catch {
              sendJson(response, 400, {
                success: false,
                message: "Health / API URL must be a valid http or https URL",
              });
              return;
            }
          }

          const result = store.createProject({
            name,
            environment,
            firstAgentName,
            serviceUrl,
          });
          sendJson(response, 201, {
            success: true,
            message: "Project created",
            data: result,
          });
          return;
        }

        const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
        if (method === "DELETE" && projectMatch) {
          const deleted = store.deleteProject(projectMatch[1]);
          if (!deleted) {
            sendJson(response, 404, {
              success: false,
              message: "Project not found",
            });
            return;
          }
          sendJson(response, 200, {
            success: true,
            message: "Project and its monitoring data deleted",
          });
          return;
        }

        if (method === "GET" && projectMatch) {
          const project = store.getProject(projectMatch[1]);
          if (!project) {
            sendJson(response, 404, {
              success: false,
              message: "Project not found",
            });
            return;
          }
          sendJson(response, 200, { success: true, data: project });
          return;
        }

        sendJson(response, 404, {
          success: false,
          message: "API route not found",
        });
        return;
      }

      if (method === "GET" && url.pathname === "/app.js") {
        serveStaticFile(
          response,
          path.join(publicDir, "app.js"),
          "application/javascript; charset=utf-8",
        );
        return;
      }

      if (method === "GET" && url.pathname === "/styles.css") {
        serveStaticFile(
          response,
          path.join(publicDir, "styles.css"),
          "text/css; charset=utf-8",
        );
        return;
      }

      if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        serveStaticFile(
          response,
          path.join(publicDir, "index.html"),
          "text/html; charset=utf-8",
        );
        return;
      }

      sendJson(response, 404, { success: false, message: "Not found" });
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        message: error.message || "Internal server error",
      });
    }
  });

module.exports = {
  createApp,
  getBearerToken,
  validateMetricsPayload,
};
