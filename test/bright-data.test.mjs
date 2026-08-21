import test from "node:test";
import assert from "node:assert/strict";
import { BrightDataClient } from "../lib/bright-data.mjs";

test("Bright Data credentials cannot be redirected to another host", () => {
  assert.throws(
    () => new BrightDataClient({ token: "test", baseUrl: "https://attacker.example" }),
    /must use https:\/\/api\.brightdata\.com/
  );
});

test("Bright Data requests require a configured token", async () => {
  const client = new BrightDataClient({ token: "" });
  await assert.rejects(() => client.request("/datasets/v3/trigger"), /not configured/);
});

test("upstream response bodies are not copied into thrown errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  try {
    const client = new BrightDataClient({ token: "test" });
    await assert.rejects(
      () => client.request("/datasets/v3/trigger"),
      error => error.message === "Bright Data request failed with status 401"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
