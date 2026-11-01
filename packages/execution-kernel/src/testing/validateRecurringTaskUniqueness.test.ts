import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateRecurringTaskUniqueness } from "../tasks/migration/validateRecurringTaskUniqueness";

class MockTaskModel {
  public docs: any[];

  constructor(docs: any[]) {
    this.docs = docs;
  }

  find(query: any) {
    const matched = this.docs.filter((d) => {
      if (query.recurringParentId && query.recurringParentId.$exists) {
        return d.recurringParentId !== undefined && d.recurringParentId !== null;
      }
      return true;
    });
    return {
      lean: async () => matched,
    };
  }
}

describe("Task Recurrence Uniqueness Preflight Validation", () => {
  it("passes when all recurring tasks have distinct (userId, recurringParentId, dueDate) tuples", async () => {
    const model = new MockTaskModel([
      { _id: "t1", userId: "u1", recurringParentId: "parentA", dueDate: "2026-11-01" },
      { _id: "t2", userId: "u1", recurringParentId: "parentA", dueDate: "2026-11-02" },
      { _id: "t3", userId: "u1", recurringParentId: "parentB", dueDate: "2026-11-01" },
      { _id: "t4", userId: "u2", recurringParentId: "parentA", dueDate: "2026-11-01" },
      { _id: "one_off", userId: "u1", recurringParentId: null, dueDate: "2026-11-01" },
    ]);

    const report = await validateRecurringTaskUniqueness(model);

    assert.equal(report.totalRecurringTasks, 4);
    assert.equal(report.duplicateCount, 0);
    assert.equal(report.isSafeForUniqueIndex, true);
  });

  it("identifies duplicate recurrence tuples without mutating records", async () => {
    const model = new MockTaskModel([
      { _id: "t1", userId: "u1", recurringParentId: "parentA", dueDate: "2026-11-01" },
      { _id: "t2_dup", userId: "u1", recurringParentId: "parentA", dueDate: "2026-11-01" },
      { _id: "t3", userId: "u1", recurringParentId: "parentA", dueDate: "2026-11-02" },
    ]);

    const report = await validateRecurringTaskUniqueness(model);

    assert.equal(report.totalRecurringTasks, 3);
    assert.equal(report.duplicateCount, 1);
    assert.equal(report.isSafeForUniqueIndex, false);
    assert.deepEqual(report.duplicates[0].taskIds, ["t1", "t2_dup"]);
  });
});

