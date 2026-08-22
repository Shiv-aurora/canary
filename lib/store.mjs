import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const emptyState = () => ({ version: 1, observations: [], runs: [], sourceStates: {}, healingEvents: [] });
const bounded = state => ({
  ...state,
  observations: state.observations.slice(-5000),
  runs: state.runs.slice(-500),
  healingEvents: state.healingEvents.slice(-500)
});

export class FileObservationStore {
  constructor(path = process.env.CANARY_DATA_PATH || join(root, "data", "runtime.json")) { this.path = path; this.kind = "file"; }
  async init() { await mkdir(dirname(this.path), { recursive: true }); try { await readFile(this.path); } catch (error) { if (error.code !== "ENOENT") throw error; await this.write(emptyState()); } return this; }
  async read() { try { return JSON.parse(await readFile(this.path, "utf8")); } catch (error) { if (error.code === "ENOENT") return emptyState(); throw error; } }
  async write(value) { const next = `${this.path}.${process.pid}.tmp`; await writeFile(next, JSON.stringify(bounded(value), null, 2), { mode: 0o600 }); await rename(next, this.path); }
  async snapshot() { return this.read(); }
  async recordRun(run, observations = [], sourceState = null) {
    const state = await this.read();
    state.runs.push(run); state.observations.push(...observations);
    if (sourceState) state.sourceStates[sourceState.sourceId] = sourceState;
    await this.write(state); return run;
  }
  async recordHealing(event, sourceState = null) {
    const state = await this.read(); state.healingEvents.push(event);
    if (sourceState) state.sourceStates[sourceState.sourceId] = sourceState;
    await this.write(state); return event;
  }
}

export class MemoryObservationStore {
  constructor() { this.state = emptyState(); this.kind = "memory"; }
  async init() { return this; }
  async snapshot() { return structuredClone(this.state); }
  async recordRun(run, observations = [], sourceState = null) { this.state.runs.push(run); this.state.observations.push(...observations); if (sourceState) this.state.sourceStates[sourceState.sourceId] = sourceState; return run; }
  async recordHealing(event, sourceState = null) { this.state.healingEvents.push(event); if (sourceState) this.state.sourceStates[sourceState.sourceId] = sourceState; return event; }
}

export class NeonObservationStore {
  constructor(databaseUrl = process.env.DATABASE_URL) { this.databaseUrl = databaseUrl; this.sql = null; this.kind = "neon"; }
  async init() {
    const { neon } = await import("@neondatabase/serverless"); this.sql = neon(this.databaseUrl);
    await this.sql`CREATE TABLE IF NOT EXISTS canary_runtime (id text PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
    await this.sql`INSERT INTO canary_runtime (id, payload) VALUES ('primary', ${JSON.stringify(emptyState())}::jsonb) ON CONFLICT (id) DO NOTHING`;
    return this;
  }
  async snapshot() { const rows = await this.sql`SELECT payload FROM canary_runtime WHERE id = 'primary'`; return rows[0]?.payload || emptyState(); }
  async mutate(callback) {
    const state = await this.snapshot(); const result = await callback(state);
    await this.sql`UPDATE canary_runtime SET payload = ${JSON.stringify(bounded(state))}::jsonb, updated_at = now() WHERE id = 'primary'`;
    return result;
  }
  async recordRun(run, observations = [], sourceState = null) { return this.mutate(state => { state.runs.push(run); state.observations.push(...observations); if (sourceState) state.sourceStates[sourceState.sourceId] = sourceState; return run; }); }
  async recordHealing(event, sourceState = null) { return this.mutate(state => { state.healingEvents.push(event); if (sourceState) state.sourceStates[sourceState.sourceId] = sourceState; return event; }); }
}

export async function createObservationStore() {
  const store = process.env.DATABASE_URL ? new NeonObservationStore() : process.env.VERCEL ? new MemoryObservationStore() : new FileObservationStore();
  return store.init();
}
