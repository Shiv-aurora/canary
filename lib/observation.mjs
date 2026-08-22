import { createHash, randomUUID } from "node:crypto";
import { validateObservation } from "./domain.mjs";

export const CONTRACT_VERSION = "1.0.0";
export const AVAILABILITY_STATES = Object.freeze([
  "in_stock", "low_stock", "backorder", "preorder", "out_of_stock", "discontinued", "unknown"
]);

const first = (value, keys) => {
  for (const key of keys) if (value?.[key] !== undefined && value[key] !== null && value[key] !== "") return value[key];
  return null;
};
const text = value => value == null ? null : String(value).trim() || null;
const numberFrom = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object") return numberFrom(value.value ?? value.amount ?? value.price ?? null);
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s/g, "").replace(/,(?=\d{3}(?:\D|$))/g, "").replace(/[^0-9.,-]/g, "").replace(",", ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};
const integerFrom = value => {
  const parsed = numberFrom(value);
  return parsed == null ? null : Math.max(0, Math.round(parsed));
};
const normalizeAvailability = value => {
  const raw = text(value)?.toLowerCase().replace(/[\s-]+/g, "_") || "";
  if (/discontinued|obsolete|end_of_life|eol/.test(raw)) return "discontinued";
  if (/out_of_stock|sold_out|unavailable/.test(raw)) return "out_of_stock";
  if (/low_stock|only_?\d+|few_left/.test(raw)) return "low_stock";
  if (/backorder|back_order|restock|re_stock/.test(raw)) return "backorder";
  if (/preorder|pre_order/.test(raw)) return "preorder";
  if (/in_stock|available|add_to_cart/.test(raw)) return "in_stock";
  return "unknown";
};
const normalizeLifecycle = (value, availability) => {
  const raw = text(value)?.toLowerCase() || "";
  if (/obsolete|discontinued|eol|end.of.life/.test(raw) || availability === "discontinued") return "obsolete";
  if (/nrnd|not recommended/.test(raw)) return "nrnd";
  if (/active|production/.test(raw)) return "active";
  return "unknown";
};
const currencyFrom = (raw, fallback) => {
  const priceValue = first(raw, ["price", "price_text", "current_price"]);
  const nestedCurrency = priceValue && typeof priceValue === "object" ? priceValue.currency : null;
  const explicit = text(first(raw, ["currency", "price_currency", "currency_code"]) ?? nestedCurrency)?.toUpperCase();
  if (explicit?.match(/^[A-Z]{3}$/)) return explicit;
  const priceText = text(first(raw, ["price", "price_text", "current_price"])) || "";
  if (priceText.includes("€")) return "EUR";
  if (priceText.includes("£")) return "GBP";
  if (/\bRM\b/i.test(priceText)) return "MYR";
  if (priceText.includes("$")) return fallback || "USD";
  return fallback || null;
};

export function normalizeObservation(raw, collector, { runId = randomUUID(), collectedAt = new Date().toISOString() } = {}) {
  const inventoryRaw = first(raw, ["inventory", "stock_quantity", "stock", "quantity_available", "available_quantity", "units"]);
  const priceRaw = first(raw, ["price_amount", "price", "current_price", "sale_price"]);
  const availability = normalizeAvailability(first(raw, ["availability", "stock_status", "stock", "status", "availability_text"]));
  const currency = currencyFrom(raw, collector.region?.currency);
  const amount = numberFrom(priceRaw);
  const sourceUrl = text(first(raw, ["url", "source_url", "canonical_source_url", "product_url"])) || collector.inputs?.[0]?.url;
  const rawEvidence = text(first(raw, ["rawEvidence", "raw_evidence", "evidence", "availability_text", "stock_status", "stock"]));
  const observation = {
    id: `obs_${createHash("sha256").update(`${collector.sourceId}:${runId}:${sourceUrl || "unknown"}`).digest("hex").slice(0, 20)}`,
    schemaVersion: CONTRACT_VERSION,
    componentId: collector.componentId,
    supplierId: collector.supplierId,
    sourceId: collector.sourceId,
    mpn: text(first(raw, ["mpn", "manufacturer_part_number", "manufacturer_number", "sku"])) || collector.mpn || null,
    manufacturer: text(first(raw, ["manufacturer", "brand"])) || collector.manufacturer || null,
    title: text(first(raw, ["title", "product_title", "product_name", "name"])),
    collectedAt: text(first(raw, ["collectedAt", "collected_at", "timestamp"])) || collectedAt,
    inventory: integerFrom(inventoryRaw),
    price: amount == null || !currency ? null : { amount, currency },
    leadTimeDays: integerFrom(first(raw, ["leadTimeDays", "lead_time_days", "lead_time", "shipping_days"])),
    availability,
    lifecycle: normalizeLifecycle(first(raw, ["lifecycle", "lifecycle_status", "product_status"]), availability),
    provenance: {
      url: sourceUrl,
      collectorId: collector.collectorId,
      runId,
      kind: collector.kind || "live",
      region: collector.region?.country || "unknown",
      rawEvidence
    }
  };
  return observation;
}

export function validateLiveObservation(observation) {
  const errors = validateObservation(observation);
  const warnings = [];
  if (observation.schemaVersion !== CONTRACT_VERSION) errors.push(`schemaVersion must remain ${CONTRACT_VERSION}`);
  if (!AVAILABILITY_STATES.includes(observation.availability)) errors.push("availability is invalid");
  if (!observation.provenance?.collectorId?.startsWith("c_")) errors.push("provenance collectorId must be a c_* Scraper Studio ID");
  if (!observation.provenance?.region) errors.push("provenance region is required");
  if (!observation.price && observation.inventory == null && observation.availability === "unknown" && observation.leadTimeDays == null && observation.lifecycle === "unknown") {
    errors.push("observation contains no usable supply signal");
  }
  if (!observation.title) warnings.push("product title was not extracted");
  if (observation.inventory == null) warnings.push("exact inventory is unavailable; it was not converted to zero");
  if (!observation.price) warnings.push("price is unavailable");
  return { valid: errors.length === 0, errors, warnings };
}

export function assessCollection(rows, collector, context = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { state: "degraded", observations: [], errors: ["collector returned no rows"], warnings: [] };
  }
  const normalized = rows.map(row => normalizeObservation(row, collector, context));
  const results = normalized.map(validateLiveObservation);
  const observations = normalized.filter((_, index) => results[index].valid);
  const errors = results.flatMap(result => result.errors);
  const warnings = results.flatMap(result => result.warnings);
  const state = observations.length === 0 ? "degraded" : errors.length || warnings.length > observations.length * 2 ? "suspicious" : "healthy";
  return { state, observations, errors, warnings };
}
