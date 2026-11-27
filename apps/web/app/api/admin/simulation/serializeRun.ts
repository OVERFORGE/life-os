import { mapDocToSnapshot } from "@/server/db/models/SimulationRun";
import { deriveRuntimeState } from "@/simulation/engine/state";
import { SimulationRunDTO } from "@/simulation/types";

export function serializeRun(doc: any): SimulationRunDTO {
  const snapshot = mapDocToSnapshot(doc);
  const state = deriveRuntimeState(snapshot.status, snapshot.tick, snapshot.configuration);

  return {
    id: doc._id?.toString() ?? doc.id ?? "",
    runUid: snapshot.context.runUid,
    personaId: snapshot.context.personaId,
    status: snapshot.status,
    startedAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    completedAt: snapshot.status === "COMPLETED" && doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    seed: snapshot.seed,
    configuration: snapshot.configuration,
    context: snapshot.context,
    state,
    metrics: snapshot.metrics,
    logs: snapshot.logs,
    error: snapshot.error,
    kernelVersion: snapshot.context.kernelVersion,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };
}
