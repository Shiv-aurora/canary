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
    return this.request(`/datasets/v3/trigger?dataset_id=${encodeURIComponent(collectorId)}&include_errors=true`, { method: "POST", body: JSON.stringify(inputs) });
  }
  async pollSnapshot(snapshotId, { timeoutMs = 120000 } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const result = await this.request(`/datasets/v3/snapshot/${encodeURIComponent(snapshotId)}`);
      if (result.status === "ready") return result;
      if (result.status === "failed") throw new Error(`Collector run ${snapshotId} failed`);
      await delay(1800);
    }
    throw new Error(`Collector run ${snapshotId} timed out`);
  }
}
