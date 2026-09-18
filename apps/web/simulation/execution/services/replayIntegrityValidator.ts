/**
 * ReplayIntegrityValidator — Phase 1.7 V2
 *
 * Automated verification service for simulation step replay readiness.
 * Given a snapshotId or (runUid, stepNumber), performs a deep audit:
 *   1. Verifies snapshot document exists
 *   2. Verifies referenced traceId exists
 *   3. Verifies journal entry points to the correct snapshot
 *   4. Verifies all referenced artifact IDs exist in sim_artifacts
 *   5. Verifies every artifact belongs to the exact same runUid and stepNumber
 *   6. Reports dangling references, mismatches, or missing payloads
 */

import { ISnapshotRepository } from "../repositories/ISnapshotRepository";
import { ITraceRepository } from "../repositories/ITraceRepository";
import { IArtifactRepository } from "../repositories/IArtifactRepository";
import { IJournalRepository } from "../repositories/IJournalRepository";

import { SnapshotRepository } from "../repositories/snapshotRepository";
import { TraceRepository } from "../repositories/traceRepository";
import { ArtifactRepository } from "../repositories/artifactRepository";
import { JournalRepository } from "../repositories/journalRepository";

export interface ReplayIntegrityReport {
  snapshotId: string;
  runUid: string;
  stepNumber: number;
  snapshotFound: boolean;
  traceFound: boolean;
  journalFound: boolean;
  artifactsFoundCount: number;
  totalExpectedArtifacts: number;
  brokenReferencesCount: number;
  runUidMatch: boolean;
  stepNumberMatch: boolean;
  isValid: boolean;
  details: string[];
}

export class ReplayIntegrityValidator {
  constructor(
    private readonly snapshotRepo: ISnapshotRepository = new SnapshotRepository(),
    private readonly traceRepo: ITraceRepository = new TraceRepository(),
    private readonly artifactRepo: IArtifactRepository = new ArtifactRepository(),
    private readonly journalRepo: IJournalRepository = new JournalRepository()
  ) {}

  /**
   * Performs an automated replay integrity check for a specific runUid + stepNumber.
   */
  async validateStep(runUid: string, stepNumber: number): Promise<ReplayIntegrityReport> {
    const details: string[] = [];
    let brokenReferencesCount = 0;
    let runUidMatch = true;
    let stepNumberMatch = true;

    // 1. Fetch Snapshot
    const snapshot = await this.snapshotRepo.findByRunAndStep(runUid, stepNumber);
    if (!snapshot) {
      return {
        snapshotId: `SNAP_${runUid}_${stepNumber}`,
        runUid,
        stepNumber,
        snapshotFound: false,
        traceFound: false,
        journalFound: false,
        artifactsFoundCount: 0,
        totalExpectedArtifacts: 0,
        brokenReferencesCount: 1,
        runUidMatch: false,
        stepNumberMatch: false,
        isValid: false,
        details: [`Snapshot not found for runUid=${runUid}, stepNumber=${stepNumber}`],
      };
    }

    // 2. Fetch Trace
    const trace = await this.traceRepo.findById(snapshot.traceId);
    const traceFound = !!trace;
    if (!traceFound) {
      brokenReferencesCount++;
      details.push(`TraceId '${snapshot.traceId}' referenced by snapshot was not found`);
    } else {
      if (trace.runUid !== runUid) runUidMatch = false;
      if (trace.stepNumber !== stepNumber) stepNumberMatch = false;
    }

    // 3. Fetch Journal Entry
    const journalEntry = await this.journalRepo.findByRunAndStep(runUid, stepNumber);
    const journalFound = !!journalEntry;
    if (!journalFound) {
      details.push(`Journal entry not found for runUid=${runUid}, stepNumber=${stepNumber}`);
    } else {
      if (journalEntry.snapshotId !== snapshot.snapshotId) {
        details.push(`Journal entry snapshotId '${journalEntry.snapshotId}' does not match snapshot '${snapshot.snapshotId}'`);
        brokenReferencesCount++;
      }
    }

    // 4. Audit Artifact References
    const artifactRefs: { key: string; id: string | null }[] = [
      { key: "promptArtifactId",         id: snapshot.promptArtifactId },
      { key: "llmResponseArtifactId",    id: snapshot.llmResponseArtifactId },
      { key: "decisionArtifactId",       id: snapshot.decisionArtifactId },
      { key: "virtualRequestArtifactId", id: snapshot.virtualRequestArtifactId },
      { key: "handleInputArtifactId",    id: snapshot.handleInputArtifactId },
      { key: "kernelResultArtifactId",   id: snapshot.kernelResultArtifactId },
      { key: "worldBeforeArtifactId",    id: snapshot.worldBeforeArtifactId },
      { key: "worldAfterArtifactId",     id: snapshot.worldAfterArtifactId },
      { key: "diagnosticsArtifactId",    id: snapshot.diagnosticsArtifactId },
    ];

    const expectedRefs = artifactRefs.filter((ref) => ref.id !== null);
    const totalExpectedArtifacts = expectedRefs.length;
    let artifactsFoundCount = 0;

    for (const ref of expectedRefs) {
      if (!ref.id) continue;
      const artifact = await this.artifactRepo.findById(ref.id);
      if (!artifact) {
        brokenReferencesCount++;
        details.push(`Artifact '${ref.key}' with id '${ref.id}' was not found in sim_artifacts`);
      } else {
        artifactsFoundCount++;
        if (artifact.runUid !== runUid) {
          runUidMatch = false;
          details.push(`Artifact '${ref.id}' has mismatched runUid '${artifact.runUid}' (expected '${runUid}')`);
        }
        if (artifact.stepNumber !== stepNumber) {
          stepNumberMatch = false;
          details.push(`Artifact '${ref.id}' has mismatched stepNumber '${artifact.stepNumber}' (expected '${stepNumber}')`);
        }
      }
    }

    const isValid =
      snapshot !== null &&
      traceFound &&
      journalFound &&
      brokenReferencesCount === 0 &&
      runUidMatch &&
      stepNumberMatch;

    if (isValid) {
      details.push(`Replay Integrity Status: VALID for snapshot ${snapshot.snapshotId}`);
    }

    return {
      snapshotId: snapshot.snapshotId,
      runUid,
      stepNumber,
      snapshotFound: true,
      traceFound,
      journalFound,
      artifactsFoundCount,
      totalExpectedArtifacts,
      brokenReferencesCount,
      runUidMatch,
      stepNumberMatch,
      isValid,
      details,
    };
  }
}
