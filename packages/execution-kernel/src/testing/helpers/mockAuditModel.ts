/**
 * Deterministic in-memory AuditModel mock for offline unit tests.
 * Prevents offline unit tests from hitting real Mongoose models when disconnected.
 */
export function createMockAuditModel() {
  const records = new Map<string, any>();

  return {
    async findOne(query: { userId: string; idempotencyKey: string }) {
      const key = `${query.userId}:${query.idempotencyKey}`;
      return records.get(key) || null;
    },
    async create(doc: any) {
      const key = `${doc.userId}:${doc.idempotencyKey}`;
      if (records.has(key)) {
        const err: any = new Error("E11000 duplicate key error");
        err.code = 11000;
        throw err;
      }
      const stored = { ...doc };
      records.set(key, stored);
      return stored;
    },
    async updateOne(query: { userId: string; idempotencyKey: string }, update: any) {
      const key = `${query.userId}:${query.idempotencyKey}`;
      const existing = records.get(key) || { ...query };
      if (update?.$set) {
        Object.assign(existing, update.$set);
      }
      if (update?.$inc) {
        for (const [field, delta] of Object.entries(update.$inc)) {
          existing[field] = (existing[field] || 0) + Number(delta);
        }
      }
      records.set(key, existing);
      return { acknowledged: true, modifiedCount: 1 };
    },
  };
}
