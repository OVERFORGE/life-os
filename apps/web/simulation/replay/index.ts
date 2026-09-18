/**
 * Replay Module Architecture (Phase 1.1 Foundation)
 */

export interface IReplayFrame {
  step: number;
  virtualTime: string;
  snapshotHash: string;
  actionTaken?: string;
}

export interface IReplaySession {
  runId: string;
  totalFrames: number;
  currentFrameIndex: number;
}
