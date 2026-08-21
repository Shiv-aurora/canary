import { riskScore, severityFor } from "./domain.mjs";

const now = new Date();
const ago = days => new Date(now.getTime() - days * 86400000).toISOString();

export function createSeed() {
  const components = [
    { id: "cmp-lidar", mpn: "LD06-HIGHRES", name: "360° LiDAR Module", assembly: "Navigation Stack", supplierCount: 1, inventory: 617, previousInventory: 2100, leadTimeDays: 42, lifecycle: "active", criticality: 1, sourceConfidence: .96 },
    { id: "cmp-som", mpn: "JETSON-ORIN-NX", name: "Edge AI Compute Module", assembly: "Compute Core", supplierCount: 2, inventory: 4120, previousInventory: 5100, leadTimeDays: 21, lifecycle: "active", criticality: 1, sourceConfidence: .94 },
    { id: "cmp-motor", mpn: "BLDC-6384", name: "Brushless Drive Motor", assembly: "Drive System", supplierCount: 3, inventory: 12800, previousInventory: 13400, leadTimeDays: 12, lifecycle: "active", criticality: .8, sourceConfidence: .91 },
    { id: "cmp-bms", mpn: "BMS-13S-80A", name: "Battery Management System", assembly: "Power System", supplierCount: 2, inventory: 7600, previousInventory: 8400, leadTimeDays: 14, lifecycle: "active", criticality: .9, sourceConfidence: .93 },
    { id: "cmp-radio", mpn: "SX1262-MOD", name: "LoRa Radio Module", assembly: "Connectivity", supplierCount: 4, inventory: 23100, previousInventory: 24000, leadTimeDays: 7, lifecycle: "active", criticality: .6, sourceConfidence: .97 }
  ].map(c => {
    const score = riskScore(c);
    return { ...c, score, severity: severityFor(score) };
  });

  return {
    meta: { generatedAt: now.toISOString(), mode: "seeded", contractVersion: "1.0.0" },
    product: { id: "prd-rover", name: "Atlas Delivery Rover", sku: "ATLAS-R2", targetBuild: 500, buildDate: "September 2026" },
    components,
    trends: {
      "cmp-lidar": [18000, 9200, 2100, 617],
      "cmp-som": [7800, 6500, 5100, 4120],
      "cmp-motor": [14200, 13900, 13400, 12800],
      "cmp-bms": [9800, 9100, 8400, 7600],
      "cmp-radio": [26000, 25100, 24000, 23100]
    },
    sources: [
      { id: "src-supplier-a", name: "Northstar Components", collectorId: "c_northstar_demo", state: "healthy", freshness: "4m", rows: 28, kind: "seeded" },
      { id: "src-manufacturer", name: "Vector Optics Catalog", collectorId: "c_vector_demo", state: "healthy", freshness: "11m", rows: 14, kind: "seeded" },
      { id: "src-controlled", name: "Controlled Supplier Fixture", collectorId: "c_fixture_demo", state: "recovered", freshness: "1m", rows: 8, kind: "controlled" },
      { id: "src-distributor", name: "Arcline Industrial", collectorId: "c_arcline_demo", state: "healthy", freshness: "19m", rows: 41, kind: "seeded" }
    ],
    observations: [18, 11, 4, 0].map((days, index) => ({
      id: `obs-lidar-${index}`, componentId: "cmp-lidar", supplierId: "sup-northstar", sourceId: "src-supplier-a",
      collectedAt: ago(days), inventory: [18000, 9200, 2100, 617][index], leadTimeDays: [8, 14, 28, 42][index], lifecycle: "active",
      provenance: { url: "https://example.com/catalog/ld06-highres", collectorId: "c_northstar_demo", runId: `run_${100 + index}`, kind: "seeded", rawEvidence: `Available: ${[18000, 9200, 2100, 617][index]} units` }
    })),
    alternatives: [
      { id: "alt-1", componentId: "cmp-lidar", mpn: "LD19-R2", manufacturer: "Lumen Dynamics", confidence: .82, status: "possible", checks: ["Connector pinout", "ROS driver validation"], stock: 6400 },
      { id: "alt-2", componentId: "cmp-lidar", mpn: "YDLIDAR-X4", manufacturer: "EAI Robotics", confidence: .68, status: "review", checks: ["Range tolerance", "Ingress rating", "Mount geometry"], stock: 3100 }
    ],
    healingEvents: [
      { at: ago(.08), state: "degraded", title: "Schema validation failed", detail: "inventory field missing after page redesign" },
      { at: ago(.06), state: "healing", title: "Collector repair started", detail: "Bright Data self-heal requested for c_fixture_demo" },
      { at: ago(.03), state: "recovered", title: "Contract verified", detail: "8 records passed v1.0.0; Collector ID unchanged" }
    ]
  };
}
