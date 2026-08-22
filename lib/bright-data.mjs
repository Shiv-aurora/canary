const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalizeBaseUrl = value => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "api.brightdata.com") {
    throw new Error("BRIGHT_DATA_API_BASE must use https://api.brightdata.com");
  }
  return url.origin;
};

export class BrightDataClient {
  constructor({ token = process.env.BRIGHT_DATA_API_TOKEN, baseUrl = process.env.BRIGHT_DATA_API_BASE || "https://api.brightdata.com", requestTimeoutMs = 30000 } = {}) {
    this.token = token;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.requestTimeoutMs = requestTimeoutMs;
  }
  get configured() { return Boolean(this.token); }
  async request(path, options = {}) {
    if (!this.token) throw new Error("BRIGHT_DATA_API_TOKEN is not configured");
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      signal: options.signal || AbortSignal.timeout(this.requestTimeoutMs),
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...options.headers }
    });
    if (!response.ok) throw new Error(`Bright Data request failed with status ${response.status}`);
    return response.json();
  }
  async triggerCollector(collectorId, inputs) {
    return this.request(`/dca/trigger?collector=${encodeURIComponent(collectorId)}&queue_next=1`, { method: "POST", body: JSON.stringify(inputs) });
  }
  async pollDataset(snapshotId, { timeoutMs = 180000, intervalMs = 5000 } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const result = await this.request(`/dca/dataset?id=${encodeURIComponent(snapshotId)}`);
      if (Array.isArray(result)) return result;
      if (["failed", "error", "canceled"].includes(result.status)) throw new Error(`Collector run ${snapshotId} failed`);
      await delay(intervalMs);
    }
    throw new Error(`Collector run ${snapshotId} timed out`);
  }
  async triggerHealing(collectorId, prompt, inputs = []) {
    return this.request(`/dca/collectors/${encodeURIComponent(collectorId)}/refactor_template`, { method: "POST", body: JSON.stringify({ prompt, custom_input: inputs }) });
  }
  async pollHealing(collectorId, { timeoutMs = 15 * 60_000, intervalMs = 5000 } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const result = await this.request(`/dca/collectors/${encodeURIComponent(collectorId)}/refactor_template/progress`);
      if (["done", "completed", "success"].includes(result.status)) return result;
      if (["failed", "error", "canceled"].includes(result.status)) throw new Error(`Self-healing failed for ${collectorId}`);
      await delay(intervalMs);
    }
    throw new Error(`Self-healing timed out for ${collectorId}`);
  }
}
