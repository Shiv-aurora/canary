import test from "node:test";
import assert from "node:assert/strict";
import { assessCollection, normalizeObservation, validateLiveObservation } from "../lib/observation.mjs";

const collector = {
  collectorId: "c_testcollector", sourceId: "src-botland-pl", supplierId: "sup-botland-pl", componentId: "cmp-lidar",
  mpn: "TFmini Plus", manufacturer: "Benewake", kind: "live", contractVersion: "1.0.0",
  region: { country: "PL", currency: "EUR" }, inputs: [{ url: "https://supplier.example/product" }]
};

test("normalizes regional supplier output into the stable contract", () => {
  const observation = normalizeObservation({ title: "TFmini Plus", price: "€49.50", available_quantity: "26 szt.", availability_text: "Available — shipping in 24 hours", lead_time: "1 day" }, collector, { runId: "j_live_1", collectedAt: "2026-08-22T10:00:00.000Z" });
  assert.equal(observation.schemaVersion, "1.0.0");
  assert.equal(observation.inventory, 26);
  assert.deepEqual(observation.price, { amount: 49.5, currency: "EUR" });
  assert.equal(observation.availability, "in_stock");
  assert.equal(observation.leadTimeDays, 1);
  assert.equal(observation.provenance.runId, "j_live_1");
  assert.equal(validateLiveObservation(observation).valid, true);
});

test("missing extraction never becomes a zero-stock observation", () => {
  const observation = normalizeObservation({ title: "TFmini Plus" }, collector, { runId: "j_broken" });
  assert.equal(observation.inventory, null);
  const result = validateLiveObservation(observation);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /no usable supply signal/);
});

test("empty and schema-invalid collector runs are degraded", () => {
  assert.equal(assessCollection([], collector).state, "degraded");
  const result = assessCollection([{ title: "Redesigned page without supply fields" }], collector, { runId: "j_bad" });
  assert.equal(result.state, "degraded");
  assert.equal(result.observations.length, 0);
});
