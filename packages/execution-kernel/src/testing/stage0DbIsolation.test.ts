import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  assertSafeTestDatabase,
  connectIsolatedTestDB,
  disconnectIsolatedTestDB,
} from "./helpers/testDbIsolation";

describe("Stage 0: Fail-Closed Real Isolated Database Foundation", () => {
  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  it("rejects production or protected database names (fail-closed)", () => {
    assert.throws(
      () => assertSafeTestDatabase("mongodb+srv://user:pass@host.example.net/life-os"),
      /UNSAFE_TEST_DATABASE_ERROR/
    );
    assert.throws(
      () => assertSafeTestDatabase("mongodb://127.0.0.1:27017/production"),
      /UNSAFE_TEST_DATABASE_ERROR/
    );
    assert.throws(
      () => assertSafeTestDatabase("mongodb://127.0.0.1:27017/test-db", "life-os"),
      /UNSAFE_TEST_DATABASE_ERROR/
    );
    assert.throws(() => assertSafeTestDatabase(""), /UNSAFE_TEST_DATABASE_ERROR/);

    assert.equal(
      assertSafeTestDatabase("mongodb://127.0.0.1:27017/life-os-stage0-test"),
      "life-os-stage0-test"
    );
  });

  it("connects to isolated replica-set test DB, syncs indexes, persists and reads back real docs", async () => {
    const connInfo = await connectIsolatedTestDB({ useMemoryReplSet: true });
    assert.equal(mongoose.connection.readyState, 1);
    assert.notEqual(connInfo.dbName, "life-os");
    assert.ok(connInfo.dbName.includes("test"));

    const { ActionAuditRecordModel } = await import(
      "../../../../apps/web/server/db/models/ActionAuditRecordModel"
    );
    const { Task } = await import("../../../../apps/web/server/db/models/Task");
    await Promise.all([ActionAuditRecordModel.syncIndexes(), Task.syncIndexes()]);

    const userId = new mongoose.Types.ObjectId();
    const createdTask = await Task.create({
      userId,
      title: "Stage 0 Isolated Persistence Verification",
      status: "pending",
      priority: "high",
      dueDate: "2026-11-26",
    });

    const readBackTask = await Task.findById(createdTask._id).lean();
    assert.ok(readBackTask);
    assert.equal((readBackTask as any).title, "Stage 0 Isolated Persistence Verification");
    assert.equal(String((readBackTask as any).userId), userId.toString());

    // Verify unique compound index on ActionAuditRecordModel (userId, idempotencyKey)
    const idempotencyKey = `idemp_stage0_${Date.now()}`;
    await ActionAuditRecordModel.create({
      userId: userId.toString(),
      actionId: `act_stage0_${Date.now()}`,
      idempotencyKey,
      actionType: "create_task",
      status: "SUCCEEDED",
      requestFingerprint: "fp_stage0_1",
      timestamp: Date.now(),
    });

    await assert.rejects(
      async () => {
        await ActionAuditRecordModel.create({
          userId: userId.toString(),
          actionId: `act_stage0_dup_${Date.now()}`,
          idempotencyKey,
          actionType: "create_task",
          status: "SUCCEEDED",
          requestFingerprint: "fp_stage0_1",
          timestamp: Date.now(),
        });
      },
      (err: any) => err?.code === 11000
    );

    // Verify replica-set transaction support
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Task.updateOne(
          { _id: createdTask._id },
          { $set: { status: "completed" } },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    const updatedReadBack = await Task.findById(createdTask._id).lean();
    assert.equal((updatedReadBack as any).status, "completed");
  });
});
