import { generateId } from "../../shared/ids";

export type MemoryCategory =
  | "Identity"
  | "Preference"
  | "Behavioral"
  | "Episodic"
  | "Semantic"
  | "Procedural"
  | "Working";

export interface MemoryRecord<T = any> {
  id: string;
  category: MemoryCategory;
  entityId?: string;
  key: string;
  value: T;
  timestamp: number;
}

export class MemorySystem {
  private records: Map<string, MemoryRecord> = new Map();

  addRecord<T = any>(
    category: MemoryCategory,
    key: string,
    value: T,
    entityId?: string
  ): MemoryRecord<T> {
    const record: MemoryRecord<T> = {
      id: generateId("mem"),
      category,
      entityId,
      key,
      value,
      timestamp: Date.now(),
    };
    this.records.set(record.id, record);
    return record;
  }

  getByCategory(category: MemoryCategory): MemoryRecord[] {
    return Array.from(this.records.values()).filter(
      (r) => r.category === category
    );
  }

  getByEntity(entityId: string): MemoryRecord[] {
    return Array.from(this.records.values()).filter(
      (r) => r.entityId === entityId
    );
  }

  clearCategory(category: MemoryCategory): void {
    for (const [id, record] of this.records.entries()) {
      if (record.category === category) {
        this.records.delete(id);
      }
    }
  }
}
