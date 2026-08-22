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

test("normalizes verified RobotShop Scraper Studio output without changing the contract", () => {
  const liveCollector = {
    ...collector,
    collectorId: "c_mt4sel7d12id86e88j",
    sourceId: "src-robotshop-us",
    supplierId: "sup-robotshop-us",
    region: { country: "US", currency: "USD" },
    inputs: [{ url: "https://www.robotshop.com/products/benewake-tfmini-plus-micro-lidar-module-uart-i2c-12-m" }]
  };
  const observation = normalizeObservation({
    product_title: "Benewake TFMINI Plus Micro LIDAR Module UART/I2C (12 m)",
    price: { value: 52, currency: "USD", symbol: "$" },
    stock: "Only 1 unit left",
    sku: "RB-Ben-09",
    url: liveCollector.inputs[0].url
  }, liveCollector, { runId: "d2t1787428348263rrec7adncgho", collectedAt: "2026-08-22T12:00:00.000Z" });

  assert.equal(observation.title, "Benewake TFMINI Plus Micro LIDAR Module UART/I2C (12 m)");
  assert.deepEqual(observation.price, { amount: 52, currency: "USD" });
  assert.equal(observation.inventory, 1);
  assert.equal(observation.availability, "low_stock");
  assert.equal(observation.provenance.rawEvidence, "Only 1 unit left");
  assert.equal(validateLiveObservation(observation).valid, true);
});

test("normalizes verified Botland output without inventing unavailable inventory", () => {
  const observation = normalizeObservation({
    product_title: "Laser distance sensor Lidar TFMini Plus UART / I2C - 12m",
    price: { value: 49.5, currency: "EUR", symbol: "€" },
    availability_text: "No scheduled delivery",
    stock_status: "Temporarily unavailable",
    shipping_text: "Free shipping Shipping from 6,50 EUR",
    sku: "BEN-13634",
    canonical_source_url: "https://botland.store/time-of-flight-sensor/13634-laser-distance-sensor-lidar-tfmini-plus-uart-i2c-12m-5903351249089.html"
  }, collector, { runId: "d2t1787428966956ruc7ijl8u93g", collectedAt: "2026-08-22T12:00:00.000Z" });

  assert.deepEqual(observation.price, { amount: 49.5, currency: "EUR" });
  assert.equal(observation.inventory, null);
  assert.equal(observation.availability, "out_of_stock");
  assert.equal(observation.provenance.rawEvidence, "No scheduled delivery");
  assert.equal(validateLiveObservation(observation).valid, true);
});

test("maps catalog rows to the configured BOM component and manufacturer by source URL", () => {
  const catalogCollector = {
    ...collector,
    componentId: "cmp-lidar",
    manufacturer: "Benewake",
    inputs: [
      { url: "https://supplier.example/lidar", componentId: "cmp-lidar", manufacturer: "Benewake" },
      { url: "https://supplier.example/motor-driver", componentId: "cmp-motor", manufacturer: "Cytron" }
    ]
  };
  const observation = normalizeObservation({
    product_title: "Dual-channel motor controller",
    price: { value: 36.32, currency: "USD" },
    stock: "Only 2 units left",
    sku: "RB-Cyt-230",
    url: "https://supplier.example/motor-driver",
    input: { url: "https://supplier.example/motor-driver" }
  }, catalogCollector, { runId: "j_catalog", collectedAt: "2026-08-22T12:00:00.000Z" });

  assert.equal(observation.componentId, "cmp-motor");
  assert.equal(observation.manufacturer, "Cytron");
  assert.equal(observation.inventory, 2);
  assert.equal(validateLiveObservation(observation).valid, true);
});

test("empty and schema-invalid collector runs are degraded", () => {
  assert.equal(assessCollection([], collector).state, "degraded");
  const result = assessCollection([{ title: "Redesigned page without supply fields" }], collector, { runId: "j_bad" });
  assert.equal(result.state, "degraded");
  assert.equal(result.observations.length, 0);
});
