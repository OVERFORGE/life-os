/**
 * ReplayTranscriptBuilder — Subsystem for Canonical Replay Transcript Assembly
 *
 * Responsible for constructing canonical versioned ReplayTranscript ("1.0.0") objects.
 * Decouples transcript assembly from ReplayRecorder step collection.
 */

import {
  ReplayTickStep,
  ReplayTranscript,
  REPLAY_SCHEMA_VERSION,
} from "../contracts/replayTranscriptContracts";

export class ReplayTranscriptBuilder {
  /**
   * Constructs a canonical versioned ReplayTranscript from collected tick steps.
   */
  public static buildTranscript(
    runUid: string,
    seed: number,
    ticks: readonly ReplayTickStep[]
  ): ReplayTranscript {
    return {
      replayVersion: REPLAY_SCHEMA_VERSION,
      runUid,
      seed,
      ticks: [...ticks],
    };
  }
}
