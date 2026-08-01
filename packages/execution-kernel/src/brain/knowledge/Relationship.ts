import { generateId } from "../../shared/ids";

export interface Relationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationType: string;
  createdAt: number;
}

export function createRelationship(
  sourceEntityId: string,
  targetEntityId: string,
  relationType: string
): Relationship {
  return {
    id: generateId("rel"),
    sourceEntityId,
    targetEntityId,
    relationType,
    createdAt: Date.now(),
  };
}
