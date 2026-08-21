import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createSeed } from "./lib/seed.mjs";
import { transitionSource } from "./lib/domain.mjs";
import { BrightDataClient } from "./lib/bright-data.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = join(root, "public");
const port = Number(process.env.PORT || 3000);
const brightData = new BrightDataClient();
let state = createSeed();

const securityHeaders = Object.freeze({
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
});

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
const body = req => new Promise((resolve, reject) => { let data = ""; req.on("data", c => data += c); req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } }); });

function dashboard() {
  const critical = state.components.filter(c => c.severity === "critical").length;
  const degraded = state.sources.filter(s => ["degraded", "healing"].includes(s.state)).length;
  return { ...state, summary: { readiness: Math.max(0, 94 - critical * 18 - degraded * 12), critical, components: state.components.length, sourcesHealthy: state.sources.length - degraded } };
}

const server = http.createServer(async (req, res) => {
  try {
    for (const [name, value] of Object.entries(securityHeaders)) res.setHeader(name, value);
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/health") return json(res, 200, { status: "ok", service: "canary", brightDataConfigured: brightData.configured, now: new Date().toISOString() });
    if (url.pathname === "/api/dashboard" && req.method === "GET") return json(res, 200, dashboard());
    if (url.pathname.startsWith("/api/components/") && req.method === "GET") {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const component = state.components.find(c => c.id === id);
      if (!component) return json(res, 404, { error: "Component not found" });
      return json(res, 200, { component, trend: state.trends[id] || [], observations: state.observations.filter(o => o.componentId === id), alternatives: state.alternatives.filter(a => a.componentId === id) });
    }
    if (url.pathname === "/api/demo/reset" && req.method === "POST") { state = createSeed(); return json(res, 200, dashboard()); }
    if (url.pathname === "/api/demo/degrade" && req.method === "POST") {
      const source = state.sources.find(s => s.id === "src-controlled");
      source.state = transitionSource("healthy", "invalid"); source.rows = 0; source.freshness = "now";
      state.healingEvents = [{ at: new Date().toISOString(), state: "degraded", title: "Extraction contract failed", detail: "Required inventory and MPN fields disappeared; no business observation was written" }];
      return json(res, 200, dashboard());
    }
    if (url.pathname === "/api/demo/heal" && req.method === "POST") {
      const source = state.sources.find(s => s.id === "src-controlled");
      if (source.state !== "degraded") return json(res, 409, { error: "Source must be degraded before healing" });
      source.state = transitionSource(source.state, "heal");
      state.healingEvents.push({ at: new Date().toISOString(), state: "healing", title: "Repair initiated", detail: `Repairing ${source.collectorId}; downstream schema remains v1.0.0` });
      return json(res, 202, dashboard());
    }
    if (url.pathname === "/api/demo/verify" && req.method === "POST") {
      const source = state.sources.find(s => s.id === "src-controlled");
      if (source.state !== "healing") return json(res, 409, { error: "Source must be healing before verification" });
      source.state = transitionSource(source.state, "verified"); source.rows = 8; source.freshness = "now";
      state.healingEvents.push({ at: new Date().toISOString(), state: "recovered", title: "Recovery verified", detail: `8/8 records passed contract v1.0.0; ${source.collectorId} unchanged` });
      return json(res, 200, dashboard());
    }
    if (url.pathname === "/api/collectors/run" && req.method === "POST") {
      if (!brightData.configured) return json(res, 503, { error: "Bright Data is not configured", action: "Set BRIGHT_DATA_API_TOKEN and replace the collector ID in config/collectors.json" });
      const input = await body(req); const run = await brightData.triggerCollector(input.collectorId, input.inputs || []); return json(res, 202, run);
    }
    if (req.method !== "GET") return json(res, 404, { error: "Not found" });
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const safe = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
    const file = join(publicRoot, safe);
    if (!file.startsWith(publicRoot)) return json(res, 403, { error: "Forbidden" });
    const content = await readFile(file); res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" }); res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") return json(res, 404, { error: "Not found" });
    json(res, 500, { error: error.message });
  }
});

server.listen(port, () => console.log(`CANARY listening on http://localhost:${port}`));
