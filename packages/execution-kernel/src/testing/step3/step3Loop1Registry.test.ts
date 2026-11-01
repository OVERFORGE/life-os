import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_DELIVERY_REGISTRY,
  isCanonicalEventType,
  getDeliveryDefinition,
  getAllCanonicalEventTypes,
  getRequiredConsumersForEvent,
  getInvalidationTagsForEvent,
} from "../../events/delivery/CanonicalDeliveryRegistry";
import { CanonicalPayloadSchemaMap } from "../../events/schemas/CanonicalEventSchemas";

describe("Step 3 Loop 1: Canonical Delivery Registry & Event Discriminator", () => {
  it("must contain at least 24 canonical events", () => {
    const allTypes = getAllCanonicalEventTypes();
    assert.ok(allTypes.length >= 24, "Registry must contain at least 24 canonical events");
  });

  it("every event in CanonicalPayloadSchemaMap must be present in CANONICAL_DELIVERY_REGISTRY", () => {
    for (const schemaType of Object.keys(CanonicalPayloadSchemaMap)) {
      assert.equal(
        isCanonicalEventType(schemaType),
        true,
        `Event schema '${schemaType}' must be registered in CANONICAL_DELIVERY_REGISTRY`
      );
    }
  });

  it("must throw an error on unregistered event types with zero fallback", () => {
    assert.throws(
      () => getDeliveryDefinition("domain.unknown.event"),
      /Unregistered canonical event type/,
      "Must throw error on unknown event"
    );
    assert.throws(
      () => getDeliveryDefinition("TASK_COMPLETED"),
      /Unregistered canonical event type/,
      "Must throw error on symbolic uppercase aliases"
    );
  });

  it("every canonical event definition must satisfy structural invariants", () => {
    const validConsumers = new Set([
      "ExecutionGraphConsumer",
      "GoalIntelligenceConsumer",
      "CadenceLearningConsumer",
      "BehavioralIntelligenceConsumer",
      "PhysicalReadinessConsumer",
      "CognitiveHistoryConsumer",
      "TemporalConflictConsumer",
    ]);

    for (const [eventType, def] of Object.entries(CANONICAL_DELIVERY_REGISTRY)) {
      assert.equal(def.eventType, eventType, "Definition eventType must match registry key");
      assert.ok(def.aggregateType, `Event '${eventType}' must define aggregateType`);
      assert.ok(def.aggregateIdField, `Event '${eventType}' must define aggregateIdField`);
      assert.ok(def.invalidationTags.length > 0, `Event '${eventType}' must have invalidation tags`);

      // Verify that all declared required consumers are real Step 2 consumers
      for (const consumerName of def.requiredConsumers) {
        assert.ok(
          validConsumers.has(consumerName),
          `Consumer '${consumerName}' in event '${eventType}' must be a known Step 2 consumer`
        );
      }
    }
  });

  it("helpers must return correct required consumers and invalidation tags", () => {
    const taskCompletedConsumers = getRequiredConsumersForEvent("domain.task.completed");
    assert.equal(taskCompletedConsumers.length, 4);
    assert.ok(taskCompletedConsumers.includes("ExecutionGraphConsumer"));
    assert.ok(taskCompletedConsumers.includes("GoalIntelligenceConsumer"));

    const taskCompletedTags = getInvalidationTagsForEvent("domain.task.completed");
    assert.ok(taskCompletedTags.includes("tasks"));
    assert.ok(taskCompletedTags.includes("dashboard"));
    assert.ok(taskCompletedTags.includes("goals"));
    assert.ok(taskCompletedTags.includes("learning"));
  });
});
