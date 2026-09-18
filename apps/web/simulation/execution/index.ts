/**
 * execution/index.ts — Phase 1.7 V2 Barrel Export
 */

// Contracts
export * from "./contracts/artifactContracts";
export * from "./contracts/executionTraceContracts";
export * from "./contracts/snapshotContracts";
export * from "./contracts/journalContracts";

// Repository interfaces
export type { IArtifactRepository } from "./repositories/IArtifactRepository";
export type { ITraceRepository } from "./repositories/ITraceRepository";
export type { ISnapshotRepository } from "./repositories/ISnapshotRepository";
export type { IJournalRepository } from "./repositories/IJournalRepository";

// Repository implementations
export { ArtifactRepository } from "./repositories/artifactRepository";
export { TraceRepository } from "./repositories/traceRepository";
export { SnapshotRepository } from "./repositories/snapshotRepository";
export { JournalRepository } from "./repositories/journalRepository";

// Builders
export { buildArtifact, buildArtifactId } from "./builders/artifactBuilder";
export { ExecutionTraceBuilder, buildTraceId } from "./builders/executionTraceBuilder";
export { buildSnapshot, buildSnapshotId } from "./builders/snapshotBuilder";
export { buildJournalEntry, buildJournalEntryId } from "./builders/journalBuilder";

// Mappers
export { computeDiff, diffToPayload } from "./mappers/diffMapper";
export { toTimelineEntry, toTimeline } from "./mappers/timelineMapper";
export { toInspectorPayload, toInspectorPayloadMap } from "./mappers/artifactMapper";

// Services
export { ExecutionRecorder } from "./services/executionRecorder";
export type { ExecutionRecordInput, ExecutionRecordResult, PostRecordHook } from "./services/executionRecorder";
export { ExecutionInspectionService } from "./services/executionInspectionService";
export type { ExecutionInspectionDTO } from "./services/executionInspectionService";
export { TimelineService } from "./services/timelineService";
export { ReplayIntegrityValidator } from "./services/replayIntegrityValidator";
export type { ReplayIntegrityReport } from "./services/replayIntegrityValidator";
