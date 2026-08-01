/**
 * GraphVersion Metadata
 * 
 * Represents a deterministic, immutable version node in the graph state lineage.
 */
export interface GraphVersion {
  version: number;
  parentVersion: number;
  repairId: string;
  createdAt: number;
}

export function createGraphVersion(
  version: number,
  parentVersion: number,
  repairId: string = "root",
  createdAt: number = Date.now()
): GraphVersion {
  return {
    version,
    parentVersion,
    repairId,
    createdAt,
  };
}
