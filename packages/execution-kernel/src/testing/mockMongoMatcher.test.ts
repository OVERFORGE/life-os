import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchesMongoQuery } from "./helpers/mockMongoMatcher";

describe("Generic MongoDB Mock Matcher", () => {
  it("matches numbers with range operators $lt, $lte, $gt, $gte", () => {
    const doc = { version: 5, score: 100 };

    assert.equal(matchesMongoQuery(doc, { version: { $lte: 5 } }), true);
    assert.equal(matchesMongoQuery(doc, { version: { $lt: 5 } }), false);
    assert.equal(matchesMongoQuery(doc, { version: { $lt: 6 } }), true);
    assert.equal(matchesMongoQuery(doc, { score: { $gt: 99 } }), true);
    assert.equal(matchesMongoQuery(doc, { score: { $gte: 100 } }), true);
    assert.equal(matchesMongoQuery(doc, { score: { $gt: 100 } }), false);
  });

  it("matches JavaScript Dates and ISO date strings accurately", () => {
    const d1 = new Date("2026-10-31T12:00:00.000Z");
    const d2 = new Date("2026-10-31T13:00:00.000Z");

    const docDate = { createdAt: d1, updatedAt: d1.toISOString() };

    assert.equal(matchesMongoQuery(docDate, { createdAt: { $lte: d2 } }), true);
    assert.equal(matchesMongoQuery(docDate, { createdAt: { $lt: d1 } }), false);
    assert.equal(matchesMongoQuery(docDate, { createdAt: { $lte: d1 } }), true);

    // Cross-type: string in doc, Date in query
    assert.equal(matchesMongoQuery(docDate, { updatedAt: { $lte: d2 } }), true);
    assert.equal(matchesMongoQuery(docDate, { updatedAt: { $gt: d2 } }), false);

    // Cross-type: Date in doc, string in query
    assert.equal(matchesMongoQuery(docDate, { createdAt: { $lte: "2026-10-31T12:30:00.000Z" } }), true);
  });

  it("matches numeric timestamps against date representations", () => {
    const ts = 1761912000000;
    const doc = { timestamp: ts };

    assert.equal(matchesMongoQuery(doc, { timestamp: { $lte: ts + 1000 } }), true);
    assert.equal(matchesMongoQuery(doc, { timestamp: { $lt: ts } }), false);
    assert.equal(matchesMongoQuery(doc, { timestamp: { $gte: ts } }), true);
  });

  it("matches $in, $nin, and $ne operators", () => {
    const doc = { status: "pending", category: "work" };

    assert.equal(matchesMongoQuery(doc, { status: { $in: ["pending", "in_progress"] } }), true);
    assert.equal(matchesMongoQuery(doc, { status: { $in: ["completed", "archived"] } }), false);
    assert.equal(matchesMongoQuery(doc, { status: { $ne: "completed" } }), true);
    assert.equal(matchesMongoQuery(doc, { status: { $ne: "pending" } }), false);
  });

  it("matches $or and $and queries", () => {
    const doc = { status: "completed", version: 2 };

    assert.equal(matchesMongoQuery(doc, {
      $or: [
        { status: "pending" },
        { version: { $gte: 2 } }
      ]
    }), true);

    assert.equal(matchesMongoQuery(doc, {
      $or: [
        { status: "pending" },
        { version: { $gt: 5 } }
      ]
    }), false);
  });
});

