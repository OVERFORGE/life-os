import { WorldSimulator } from "./world/engine/worldSimulator";
import { createInitialWorldState } from "./world/contracts/worldStateContracts";
import { SnapshotHasher } from "./execution/services/snapshotHasher";
import { ReplayHasher } from "./execution/services/replayHasher";
import {
  ReplayTranscript,
  ReplayTickStep,
  DeterministicEngineDiagnostics,
  REPLAY_SCHEMA_VERSION,
} from "./execution/contracts/replayTranscriptContracts";

console.log("=== LIFEOS SIMULATION KERNEL V1 FREEZE VERIFICATION ===");

const SEED = 424242;
const RUN_UID = "RUN_FREEZE_VERIFY_001";
const STEPS_COUNT = 15;

function runSimulation(seed: number): { transcript: ReplayTranscript; finalWorldHash: string } {
  const simulator = new WorldSimulator(seed);
  let state = createInitialWorldState(RUN_UID, 1, 480);

  const tickSteps: ReplayTickStep[] = [];

  for (let i = 0; i < STEPS_COUNT; i++) {
    const step = simulator.tickMinute(state);
    state = step.state;

    const worldHash = SnapshotHasher.computeWorldHash(state as unknown as Record<string, unknown>);

    const deterministicDiagnostics: DeterministicEngineDiagnostics[] = step.diagnostics.map((d) => ({
      engineName: d.engineName,
      engineVersion: d.engineVersion,
      stage: d.stage,
      stateChangesCount: d.stateChangesCount,
      changedStatePaths: d.changedStatePaths,
      eventsCount: d.eventsCount,
      warnings: d.warnings,
      inputSummary: d.inputSummary,
      outputSummary: d.outputSummary,
    }));

    tickSteps.push({
      tick: state.version,
      virtualDay: state.virtualDay,
      virtualMinute: state.virtualMinute,
      worldHash,
      events: step.publishedEvents,
      diagnostics: deterministicDiagnostics,
    });
  }

  const finalWorldHash = SnapshotHasher.computeWorldHash(state as unknown as Record<string, unknown>);

  const transcript: ReplayTranscript = {
    replayVersion: REPLAY_SCHEMA_VERSION,
    runUid: RUN_UID,
    seed,
    ticks: tickSteps,
  };

  return { transcript, finalWorldHash };
}

// Pass 1
const run1 = runSimulation(SEED);
const replayHash1 = ReplayHasher.computeReplayHash(run1.transcript);

// Pass 2 (Independent Replay with identical seed)
const run2 = runSimulation(SEED);
const replayHash2 = ReplayHasher.computeReplayHash(run2.transcript);

console.log(`Pass 1 World Hash:  ${run1.finalWorldHash}`);
console.log(`Pass 2 World Hash:  ${run2.finalWorldHash}`);
console.log(`Pass 1 Replay Hash: ${replayHash1}`);
console.log(`Pass 2 Replay Hash: ${replayHash2}`);

if (run1.finalWorldHash !== run2.finalWorldHash) {
  console.error("❌ DETERMINISM FAILURE: World hashes do not match across replays!");
  process.exit(1);
}

if (replayHash1 !== replayHash2) {
  console.error("❌ DETERMINISM FAILURE: Replay hashes do not match across replays!");
  process.exit(1);
}

console.log("✅ DETERMINISM VERIFIED: Single Replay Transcript SHA-256 Hash matches byte-for-byte!");
console.log("=== SIMULATION KERNEL V1 ARCHITECTURE FREEZE VERIFIED CLEANLY ===");
