import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileObservationStore } from "../lib/store.mjs";

test("file store persists observations and source health across instances", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canary-store-"));
  const path = join(directory, "runtime.json");
  const first = await new FileObservationStore(path).init();
  await first.recordRun({ id: "run-1" }, [{ id: "obs-1", inventory: 12 }], { sourceId: "source-1", state: "healthy" });
  const second = await new FileObservationStore(path).init();
  const snapshot = await second.snapshot();
  assert.equal(snapshot.runs[0].id, "run-1");
  assert.equal(snapshot.observations[0].inventory, 12);
  assert.equal(snapshot.sourceStates["source-1"].state, "healthy");
  const mode = (await stat(path)).mode & 0o777;
  assert.equal(mode, 0o600);
});
