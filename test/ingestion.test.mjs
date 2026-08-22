import test from "node:test";
import assert from "node:assert/strict";
import { IngestionService } from "../lib/ingestion.mjs";
import { MemoryObservationStore } from "../lib/store.mjs";

const registry = { collectors: [{ key: "supplier", enabled: true, collectorId: "c_live", sourceId: "src-live", supplierId: "sup-live", componentId: "cmp-lidar", mpn: "TFmini Plus", manufacturer: "Benewake", kind: "live", contractVersion: "1.0.0", region: { country: "US", currency: "USD" }, inputs: [{ url: "https://supplier.example/item" }] }] };

test("collection persists a validated live observation and run provenance", async () => {
  const client = { triggerCollector: async () => ({ collection_id: "j_snapshot" }), pollDataset: async () => [{ title: "TFmini Plus", price: "$52.00", inventory: 7, availability: "In stock" }] };
  const store = await new MemoryObservationStore().init();
  const service = new IngestionService({ client, store, registry });
  const result = await service.collect("supplier");
  assert.equal(result.run.status, "complete");
  assert.equal(result.observations[0].provenance.collectorId, "c_live");
  assert.equal((await store.snapshot()).observations.length, 1);
});

test("failed extraction records degradation without a business observation", async () => {
  const client = { triggerCollector: async () => ({ collection_id: "j_broken" }), pollDataset: async () => [] };
  const store = await new MemoryObservationStore().init();
  const service = new IngestionService({ client, store, registry });
  const result = await service.collect("supplier");
  assert.equal(result.sourceState.state, "degraded");
  assert.equal((await store.snapshot()).observations.length, 0);
});

test("catalog collection gives larger Bright Data batches enough time to finish", async () => {
  let pollOptions;
  let triggeredInputs;
  const inputs = Array.from({ length: 12 }, (_, index) => ({ url: `https://supplier.example/item-${index}`, componentId: "cmp-internal", manufacturer: "Internal metadata" }));
  const catalogRegistry = { collectors: [{ ...registry.collectors[0], inputs }] };
  const client = {
    triggerCollector: async (_collectorId, payload) => { triggeredInputs = payload; return { collection_id: "j_catalog" }; },
    pollDataset: async (_id, options) => { pollOptions = options; return [{ title: "Catalog item", price: "$12.00" }]; }
  };
  const store = await new MemoryObservationStore().init();
  const service = new IngestionService({ client, store, registry: catalogRegistry });
  await service.collect("supplier");
  assert.equal(pollOptions.timeoutMs, 240_000);
  assert.deepEqual(triggeredInputs[0], { url: "https://supplier.example/item-0" });
});
