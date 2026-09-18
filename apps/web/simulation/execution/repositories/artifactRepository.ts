/**
 * ArtifactRepository — Phase 1.7 V2
 *
 * Concrete MongoDB implementation of IArtifactRepository.
 * Operates on the sim_artifacts collection.
 * Append-only. Never updates existing records.
 */

import { SimulationArtifact, ArtifactKind } from "../contracts/artifactContracts";
import { IArtifactRepository, RepositoryWriteOptions } from "./IArtifactRepository";
import { SimulationArtifactModel } from "@/server/db/models/SimulationArtifact";

interface ArtifactDocument {
  schemaVersion: "1.0.0";
  artifactId: string;
  runUid: string;
  stepNumber: number;
  kind: ArtifactKind;
  payloadType: string;
  payloadVersion: string;
  payload: Record<string, unknown>;
  createdAtVirtualMinute: number;
}

export class ArtifactRepository implements IArtifactRepository {
  async persist(artifact: SimulationArtifact, options?: RepositoryWriteOptions): Promise<void> {
    await SimulationArtifactModel.replaceOne(
      { artifactId: artifact.artifactId },
      artifact,
      { upsert: true, session: options?.session as any }
    );
  }

  async findById(artifactId: string): Promise<SimulationArtifact | null> {
    const doc = await SimulationArtifactModel.findOne({ artifactId }).lean<ArtifactDocument | null>();
    if (!doc) return null;
    return this._toContract(doc);
  }

  async findAllForStep(runUid: string, stepNumber: number): Promise<SimulationArtifact[]> {
    const docs = await SimulationArtifactModel
      .find({ runUid, stepNumber })
      .lean<ArtifactDocument[]>();
    return docs.map((d) => this._toContract(d));
  }

  async findByKind(runUid: string, stepNumber: number, kind: ArtifactKind): Promise<SimulationArtifact | null> {
    const doc = await SimulationArtifactModel
      .findOne({ runUid, stepNumber, kind })
      .lean<ArtifactDocument | null>();
    if (!doc) return null;
    return this._toContract(doc);
  }

  private _toContract(doc: ArtifactDocument): SimulationArtifact {
    return {
      schemaVersion: doc.schemaVersion,
      artifactId:    doc.artifactId,
      runUid:        doc.runUid,
      stepNumber:    doc.stepNumber,
      kind:          doc.kind,
      payloadType:   doc.payloadType,
      payloadVersion:doc.payloadVersion,
      payload:       doc.payload,
      createdAtVirtualMinute: doc.createdAtVirtualMinute,
    };
  }
}
