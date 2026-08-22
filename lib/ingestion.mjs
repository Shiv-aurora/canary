import { randomUUID } from "node:crypto";
import { assessCollection } from "./observation.mjs";

const iso = () => new Date().toISOString();
const errorSummary = error => error?.message?.slice(0, 240) || "Unknown collector failure";

export class IngestionService {
  constructor({ client, store, registry }) { this.client = client; this.store = store; this.registry = registry; }
  collector(keyOrId) { return this.registry.collectors.find(item => item.key === keyOrId || item.collectorId === keyOrId); }
  async collect(keyOrId, { inputs, trigger = "manual" } = {}) {
    const collector = this.collector(keyOrId);
    if (!collector || !collector.enabled) throw Object.assign(new Error("Collector is not enabled in the registry"), { status: 403 });
    const run = { id: `run_${randomUUID()}`, sourceId: collector.sourceId, collectorId: collector.collectorId, trigger, status: "running", startedAt: iso(), finishedAt: null, rows: 0, validRows: 0, errors: [], warnings: [], region: collector.region };
    try {
      const queued = await this.client.triggerCollector(collector.collectorId, inputs || collector.inputs || []);
      run.snapshotId = queued.collection_id || queued.snapshot_id || queued.id;
      if (!run.snapshotId) throw new Error("Bright Data did not return a collection ID");
      const rows = await this.client.pollDataset(run.snapshotId);
      const assessment = assessCollection(rows, collector, { runId: run.snapshotId, collectedAt: iso() });
      Object.assign(run, { status: assessment.state === "degraded" ? "invalid" : "complete", finishedAt: iso(), rows: rows.length, validRows: assessment.observations.length, errors: assessment.errors, warnings: assessment.warnings });
      const sourceState = { sourceId: collector.sourceId, collectorId: collector.collectorId, state: assessment.state, lastRunId: run.id, lastSnapshotId: run.snapshotId, lastAttemptAt: run.finishedAt, lastSuccessAt: assessment.observations.length ? run.finishedAt : null, rows: assessment.observations.length, region: collector.region, errors: assessment.errors.slice(0, 5), contractVersion: collector.contractVersion };
      await this.store.recordRun(run, assessment.observations, sourceState);
      return { run, observations: assessment.observations, sourceState };
    } catch (error) {
      Object.assign(run, { status: "failed", finishedAt: iso(), errors: [errorSummary(error)] });
      const sourceState = { sourceId: collector.sourceId, collectorId: collector.collectorId, state: "degraded", lastRunId: run.id, lastAttemptAt: run.finishedAt, rows: 0, region: collector.region, errors: run.errors, contractVersion: collector.contractVersion };
      await this.store.recordRun(run, [], sourceState); throw error;
    }
  }
  async heal(keyOrId, prompt) {
    const collector = this.collector(keyOrId);
    if (!collector || !collector.enabled) throw Object.assign(new Error("Collector is not enabled in the registry"), { status: 403 });
    const before = await this.store.snapshot();
    const state = before.sourceStates[collector.sourceId];
    if (!state || !["degraded", "suspicious"].includes(state.state)) throw Object.assign(new Error("Collector must be degraded or suspicious before healing"), { status: 409 });
    const eventBase = { id: `heal_${randomUUID()}`, sourceId: collector.sourceId, collectorId: collector.collectorId, contractVersion: collector.contractVersion, startedAt: iso(), triggerReason: state.errors?.join("; ") || "Contract validation failed" };
    await this.store.recordHealing({ ...eventBase, state: "healing", title: "Bright Data self-healing started", detail: `Repairing ${collector.collectorId} in place` }, { ...state, state: "healing" });
    await this.client.triggerHealing(collector.collectorId, prompt, collector.inputs || []);
    const progress = await this.client.pollHealing(collector.collectorId);
    const verification = await this.collect(collector.key, { trigger: "post-heal-verification" });
    if (!["healthy", "suspicious"].includes(verification.sourceState.state)) throw new Error("Healed collector did not pass the stable contract");
    const recovered = { ...verification.sourceState, state: "recovered" };
    const event = { ...eventBase, finishedAt: iso(), state: "recovered", title: "Collector recovered", detail: `${verification.observations.length} records passed contract ${collector.contractVersion}; Collector ID unchanged`, progress };
    await this.store.recordHealing(event, recovered); return { event, sourceState: recovered, run: verification.run };
  }
}
