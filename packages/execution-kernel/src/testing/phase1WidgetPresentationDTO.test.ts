import { test } from "node:test";
import assert from "node:assert";
import { InteractionSurfaceService } from "../experience/surface/InteractionSurfaceService";
import {
  mapProjectionToWidgetDTO,
  IWidgetPresentationDTO,
} from "../experience/surface/contracts/WidgetPresentationDTO";
import { IInteractionSurfaceProjection } from "../experience/surface/contracts/InteractionSurfaceContracts";
import { TemporalOccurrence } from "../temporal/contracts/TemporalContracts";

test("Phase 1: Widget Presentation DTO adheres to schemaVersion 1 and zero hex colors", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_phase1_test";
  const now = 1775000000000;

  const dto = await service.computeWidgetPresentationDTO(userId, { referenceTimeMs: now });

  assert.strictEqual(dto.schemaVersion, 1);
  assert.strictEqual(dto.displayState, "CLEAR");
  assert.strictEqual(dto.visualIntent, "CALM");
  assert.strictEqual(dto.headerLabel, "LIFEOS");
  assert.strictEqual(dto.primaryTitle, "You're clear.");
  assert.strictEqual(dto.allowedActions.canStart, false);
  assert.strictEqual(dto.allowedActions.canComplete, false);

  // Assert zero hex color codes exist anywhere in the payload
  const json = JSON.stringify(dto);
  assert.doesNotMatch(json, /#[0-9a-fA-F]{3,8}/);
  assert.ok(json.length < 1000, `DTO payload size (${json.length} bytes) exceeds 1000 byte budget`);
});

test("Phase 1: DORMANT / SILENT projection maps deterministically to CLEAR state", async () => {
  const mockProjection: IInteractionSurfaceProjection = {
    schemaVersion: 2,
    projectionVersion: 4,
    generatedAtMs: 1775000000000,
    userId: "usr_calm",
    interactionMode: "SILENT",
    activeExecution: null,
    upcomingCommitment: null,
    pendingIntervention: null,
    conversationContext: { activeConversationId: "conv_1" },
  };

  const dto = mapProjectionToWidgetDTO(mockProjection);

  assert.strictEqual(dto.displayState, "CLEAR");
  assert.strictEqual(dto.visualIntent, "CALM");
  assert.strictEqual(dto.badgeText, "CLEAR");
  assert.strictEqual(dto.primaryTitle, "You're clear.");
  assert.strictEqual(dto.secondaryText, "Nothing scheduled today");
  assert.strictEqual(dto.temporalContext, null);
  assert.strictEqual(dto.activeContext, null);
  assert.strictEqual(dto.upcomingContext, null);
  assert.deepStrictEqual(dto.allowedActions, {
    canStart: false,
    canComplete: false,
    canPause: false,
    canExtend: false,
  });
});

test("Phase 1: GLANCE mode maps to UPCOMING state with amber visualIntent and canStart=true", async () => {
  const startsAt = 1775000000000 + 15 * 60 * 1000;
  const mockProjection: IInteractionSurfaceProjection = {
    schemaVersion: 2,
    projectionVersion: 5,
    generatedAtMs: 1775000000000,
    userId: "usr_upcoming",
    interactionMode: "GLANCE",
    activeExecution: null,
    upcomingCommitment: {
      commitmentId: "occ_deepwork_1",
      title: "Architecture Review",
      category: "DEEP_WORK",
      startsAtMs: startsAt,
      minutesUntilStart: 15,
      isHardSchedule: true,
    },
    pendingIntervention: null,
    conversationContext: { activeConversationId: "conv_1" },
  };

  const dto = mapProjectionToWidgetDTO(mockProjection);

  assert.strictEqual(dto.displayState, "UPCOMING");
  assert.strictEqual(dto.visualIntent, "UPCOMING");
  assert.strictEqual(dto.badgeText, "IN 15M");
  assert.strictEqual(dto.primaryTitle, "Architecture Review");
  assert.strictEqual(dto.secondaryText, "DEEP_WORK • Scheduled focus block");
  assert.ok(dto.temporalContext);
  assert.strictEqual(dto.temporalContext.nextCommitmentStartMs, startsAt);
  assert.strictEqual(dto.temporalContext.nextCommitmentTitle, "Architecture Review");
  assert.strictEqual(dto.temporalContext.minutesUntilStart, 15);
  assert.ok(dto.upcomingContext);
  assert.strictEqual(dto.upcomingContext.entityId, "occ_deepwork_1");
  assert.strictEqual(dto.allowedActions.canStart, true);
  assert.strictEqual(dto.allowedActions.canComplete, false);
});

test("Phase 1: ACTIVE_EXECUTION mode maps to ACTIVE state with raw start epoch for native Chronometer", async () => {
  const startedAt = 1775000000000 - 10 * 60 * 1000;
  const mockProjection: IInteractionSurfaceProjection = {
    schemaVersion: 2,
    projectionVersion: 6,
    generatedAtMs: 1775000000000,
    userId: "usr_active",
    interactionMode: "ACTIVE_EXECUTION",
    activeExecution: {
      status: "ACTIVE",
      taskId: "task_widget_refactor",
      occurrenceId: "occ_active_42",
      title: "Refactor Native Widget Provider",
      category: "DEEP_WORK",
      startedAtMs: startedAt,
      plannedDurationMinutes: 45,
      elapsedSeconds: 600,
      remainingSeconds: 2100,
      canExtend: true,
      canPause: true,
      canComplete: true,
      idempotencySeed: "occ_active_42",
    },
    upcomingCommitment: null,
    pendingIntervention: null,
    conversationContext: { activeConversationId: "conv_1" },
  };

  const dto = mapProjectionToWidgetDTO(mockProjection);

  assert.strictEqual(dto.displayState, "ACTIVE");
  assert.strictEqual(dto.visualIntent, "ACTIVE");
  assert.strictEqual(dto.badgeText, ""); // Chronometer handles badge natively
  assert.strictEqual(dto.primaryTitle, "Refactor Native Widget Provider");
  assert.strictEqual(dto.secondaryText, "Target: 45m • Tap when done");
  assert.ok(dto.activeContext);
  assert.strictEqual(dto.activeContext.entityId, "occ_active_42");
  assert.strictEqual(dto.activeContext.startedAtMs, startedAt);
  assert.strictEqual(dto.activeContext.plannedDurationMinutes, 45);
  assert.strictEqual(dto.activeContext.elapsedSeconds, 600);
  assert.strictEqual(dto.activeContext.idempotencySeed, "occ_active_42");
  assert.strictEqual(dto.allowedActions.canStart, false);
  assert.strictEqual(dto.allowedActions.canComplete, true);
  assert.strictEqual(dto.allowedActions.canPause, true);
  assert.strictEqual(dto.allowedActions.canExtend, true);
});

test("Phase 1: ATTENTION / Proposal maps to PROPOSAL state with canStart=true", async () => {
  const mockProjection: IInteractionSurfaceProjection = {
    schemaVersion: 2,
    projectionVersion: 7,
    generatedAtMs: 1775000000000,
    userId: "usr_proposal",
    interactionMode: "ATTENTION",
    activeExecution: null,
    upcomingCommitment: null,
    pendingIntervention: {
      interventionId: "int_start_gym",
      type: "PROPOSAL_START",
      headline: "Gym Session Due",
      explanation: "Time for scheduled strength workout",
      primaryAction: {
        actionType: "start_execution",
        label: "Start",
        entityId: "task_gym",
        parameters: { plannedDurationMinutes: 60 },
      },
    },
    conversationContext: { activeConversationId: "conv_1" },
  };

  const dto = mapProjectionToWidgetDTO(mockProjection);

  assert.strictEqual(dto.displayState, "PROPOSAL");
  assert.strictEqual(dto.visualIntent, "PROPOSAL");
  assert.strictEqual(dto.badgeText, "PROPOSAL");
  assert.strictEqual(dto.primaryTitle, "Gym Session Due");
  assert.strictEqual(dto.allowedActions.canStart, true);
  assert.strictEqual(dto.allowedActions.canComplete, false);
});

test("Phase 1: Deterministic mapping stability across 50 iterations", async () => {
  const mockProjection: IInteractionSurfaceProjection = {
    schemaVersion: 2,
    projectionVersion: 10,
    generatedAtMs: 1775000000000,
    userId: "usr_repeatable",
    interactionMode: "SILENT",
    activeExecution: null,
    upcomingCommitment: {
      commitmentId: "occ_stable",
      title: "Weekly Review",
      category: "ROUTINE",
      startsAtMs: 1775000000000 + 120 * 60 * 1000,
      minutesUntilStart: 120,
      isHardSchedule: true,
    },
    pendingIntervention: null,
    conversationContext: { activeConversationId: "conv_1" },
  };

  const baselineJson = JSON.stringify(mapProjectionToWidgetDTO(mockProjection));

  for (let i = 0; i < 50; i++) {
    const iterationJson = JSON.stringify(mapProjectionToWidgetDTO(mockProjection));
    assert.strictEqual(iterationJson, baselineJson);
  }
});
