import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { backfillTemporalFencing } from "../temporal/migration/backfillTemporalFencing";

class MockTemporalModel {
  public docs: Map<string, any> = new Map();

  constructor(initialDocs: any[]) {
    for (const doc of initialDocs) {
      this.docs.set(String(doc._id), JSON.parse(JSON.stringify(doc)));
    }
  }

  find(query: any) {
    const matched: any[] = [];
    for (const doc of this.docs.values()) {
      const missingEpoch = doc.mutationEpoch === undefined || doc.mutationEpoch === null;
      const missingReceipts = doc.recentMutationReceipts === undefined || doc.recentMutationReceipts === null;
      if (missingEpoch || missingReceipts) {
        matched.push(JSON.parse(JSON.stringify(doc)));
      }
    }
    return {
      limit: (_n: number) => ({
        lean: async () => matched,
      }),
      lean: async () => matched,
    };
  }

  async updateOne(filter: { _id: string }, update: { $set: any }) {
    const doc = this.docs.get(String(filter._id));
    if (doc && update.$set) {
      Object.assign(doc, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }
}

describe("Temporal Fencing Backfill Migration", () => {
  it("detects and reports missing fields in dry-run without mutating docs", async () => {
    const mockModel = new MockTemporalModel([
      { _id: "doc1", title: "Missing Both", version: 1 },
      { _id: "doc2", title: "Missing Receipts Only", version: 1, mutationEpoch: 3 },
      { _id: "doc3", title: "Missing Epoch Only", version: 1, recentMutationReceipts: [{ clientMutationId: "m1" }] },
      { _id: "doc4", title: "Fully Compliant", version: 1, mutationEpoch: 1, recentMutationReceipts: [] },
    ]);

    const dryRunReport = await backfillTemporalFencing(mockModel, { dryRun: true });

    assert.equal(dryRunReport.totalScanned, 3);
    assert.equal(dryRunReport.repairedEpochCount, 2); // doc1 and doc3
    assert.equal(dryRunReport.repairedReceiptsCount, 2); // doc1 and doc2
    assert.equal(dryRunReport.errors.length, 0);

    // Verify documents were NOT modified during dryRun
    assert.equal(mockModel.docs.get("doc1").mutationEpoch, undefined);
    assert.equal(mockModel.docs.get("doc2").recentMutationReceipts, undefined);
    assert.equal(mockModel.docs.get("doc3").mutationEpoch, undefined);
  });

  it("safely and independently repairs missing fields without overwriting valid data", async () => {
    const mockModel = new MockTemporalModel([
      { _id: "doc1", title: "Missing Both", version: 1 },
      { _id: "doc2", title: "Missing Receipts Only", version: 1, mutationEpoch: 3 },
      { _id: "doc3", title: "Missing Epoch Only", version: 1, recentMutationReceipts: [{ clientMutationId: "m1" }] },
      { _id: "doc4", title: "Fully Compliant", version: 1, mutationEpoch: 1, recentMutationReceipts: [{ clientMutationId: "existing" }] },
    ]);

    const liveReport = await backfillTemporalFencing(mockModel, { dryRun: false });

    assert.equal(liveReport.totalScanned, 3);
    assert.equal(liveReport.repairedEpochCount, 2);
    assert.equal(liveReport.repairedReceiptsCount, 2);

    // doc1 had both missing
    const doc1 = mockModel.docs.get("doc1");
    assert.equal(doc1.mutationEpoch, 0);
    assert.deepEqual(doc1.recentMutationReceipts, []);

    // doc2 preserved valid mutationEpoch: 3 and got initialized receipts
    const doc2 = mockModel.docs.get("doc2");
    assert.equal(doc2.mutationEpoch, 3);
    assert.deepEqual(doc2.recentMutationReceipts, []);

    // doc3 preserved existing receipts and got mutationEpoch: 0
    const doc3 = mockModel.docs.get("doc3");
    assert.equal(doc3.mutationEpoch, 0);
    assert.deepEqual(doc3.recentMutationReceipts, [{ clientMutationId: "m1" }]);

    // doc4 remained untouched
    const doc4 = mockModel.docs.get("doc4");
    assert.equal(doc4.mutationEpoch, 1);
    assert.deepEqual(doc4.recentMutationReceipts, [{ clientMutationId: "existing" }]);

    // Rerun: must be idempotent and scan 0 records
    const rerunReport = await backfillTemporalFencing(mockModel, { dryRun: false });
    assert.equal(rerunReport.totalScanned, 0);
    assert.equal(rerunReport.repairedEpochCount, 0);
    assert.equal(rerunReport.repairedReceiptsCount, 0);
  });
});

