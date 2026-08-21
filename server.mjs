import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createSeed } from "./lib/seed.mjs";
import { transitionSource } from "./lib/domain.mjs";
import { BrightDataClient } from "./lib/bright-data.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = join(root, "public");
const port = Number(process.env.PORT || 3000);
const brightData = new BrightDataClient();
const collectorRegistry = JSON.parse(await readFile(join(root, "config", "collectors.json"), "utf8"));
const allowedCollectorIds = new Set(collectorRegistry.collectors.filter(item => item.enabled).map(item => item.collectorId));
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

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};
const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
const isSameOriginRequest = req => {
  const fetchSite = req.headers["sec-fetch-site"];
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; }
  catch { return false; }
};
const areSafeCollectorInputs = value => Array.isArray(value) && value.length <= 50 && value.every(item =>
  item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length <= 25 &&
  Object.values(item).every(field => field == null || typeof field === "boolean" ||
    (typeof field === "number" && Number.isFinite(field)) ||
    (typeof field === "string" && field.length <= 2048))
);
const body = (req, limitBytes = 64 * 1024) => new Promise((resolve, reject) => {
  let data = "";
  let size = 0;
  let exceeded = false;
  req.on("data", chunk => {
    size += Buffer.byteLength(chunk);
    if (size > limitBytes) exceeded = true;
    else if (!exceeded) data += chunk;
  });
  req.on("error", reject);
  req.on("end", () => {
    if (exceeded) return reject(Object.assign(new Error("Request body too large"), { status: 413 }));
    try { resolve(data ? JSON.parse(data) : {}); }
    catch { reject(Object.assign(new Error("Malformed JSON body"), { status: 400 })); }
  });
});

function dashboard() {
  const critical = state.components.filter(c => c.severity === "critical").length;
  const degraded = state.sources.filter(s => ["degraded", "healing"].includes(s.state)).length;
  return { ...state, summary: { readiness: Math.max(0, 94 - critical * 18 - degraded * 12), critical, components: state.components.length, sourcesHealthy: state.sources.length - degraded } };
}

const server = http.createServer(async (req, res) => {
  try {
    for (const [name, value] of Object.entries(securityHeaders)) res.setHeader(name, value);
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !isSameOriginRequest(req)) {
      return json(res, 403, { error: "Cross-origin mutation denied" });
    }
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
      if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
        return json(res, 415, { error: "Content-Type must be application/json" });
      }
      if (!brightData.configured) return json(res, 503, { error: "Bright Data is not configured", action: "Set BRIGHT_DATA_API_TOKEN and replace the collector ID in config/collectors.json" });
      const input = await body(req);
      if (!allowedCollectorIds.has(input.collectorId)) return json(res, 403, { error: "Collector is not enabled in the registry" });
      const inputs = input.inputs ?? [];
      if (!areSafeCollectorInputs(inputs)) return json(res, 400, { error: "Collector inputs must be a bounded array of scalar records" });
      const run = await brightData.triggerCollector(input.collectorId, inputs); return json(res, 202, run);
    }
    if (req.method !== "GET") return json(res, 404, { error: "Not found" });
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = resolve(publicRoot, relative);
    if (!file.startsWith(`${publicRoot}${sep}`)) return json(res, 403, { error: "Forbidden" });
    const extension = extname(file).toLowerCase();
    const content = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") return json(res, 404, { error: "Not found" });
    json(res, error.status || 500, { error: error.status ? error.message : "Internal server error" });
  }
});

server.listen(port, () => console.log(`CANARY listening on http://localhost:${port}`));
