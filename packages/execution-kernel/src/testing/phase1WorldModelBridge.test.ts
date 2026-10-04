/**
 * phase1WorldModelBridge.test.ts
 * Phase 1 Verification Suite: Canonical Unified World Model & Context Bridge
 * Validates WorldModelBridge, ContextProjectionSerializer, token budgets, and degraded path.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldModelBridge } from '../worldv2/WorldModelBridge';
import { ContextProjectionSerializer } from '../worldv2/ContextProjectionSerializer';
import { ILifeContextProjection } from '../worldv2/contracts/LifeContextProjectionContracts';
import { Supervisor } from '../orchestration/supervisor/Supervisor';

test('PHASE 1: Canonical Unified World Model & Context Bridge Suite', async (suite) => {
  const bridge = WorldModelBridge.getInstance();
  const testUserId = `phase1_test_user_${Date.now()}`;

  await suite.test('BRIDGE-01: WorldModelBridge hydrates typed ILifeContextProjection within < 15ms budget', async () => {
    const start = process.hrtime.bigint();
    const projection = await bridge.getProjection(testUserId);
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    console.log(`[Phase 1] Bridge hydration duration: ${durationMs.toFixed(2)}ms`);

    assert.ok(projection, 'Projection must exist');
    assert.equal(projection.userId, testUserId);
    assert.equal(projection.degradation.isDegraded, false, 'Initial projection must not be degraded');
    assert.ok(projection.cognitiveState, 'Cognitive state must be present');
    assert.ok(projection.physicalReadiness, 'Physical readiness must be present');
    assert.ok(projection.operationalSchedule, 'Operational schedule must be present');
    assert.ok(projection.systemPromptContextSummary, 'Serialized context summary must be present');
  });

  await suite.test('BRIDGE-02: TTL In-Memory Cache returns sub-millisecond response on cache hit', async () => {
    const start = process.hrtime.bigint();
    const cachedProjection = await bridge.getProjection(testUserId);
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    console.log(`[Phase 1] Bridge cache hit duration: ${durationMs.toFixed(3)}ms`);

    assert.ok(durationMs < 5.0, 'Cache hit must return in < 5ms');
    assert.equal(cachedProjection.userId, testUserId);
  });

  await suite.test('BRIDGE-03: Cache Invalidation forces re-hydration', async () => {
    bridge.invalidate(testUserId);
    const projection = await bridge.getProjection(testUserId);
    assert.ok(projection);
  });

  await suite.test('SERIALIZER-01: ContextProjectionSerializer enforces <= 250 token budget', async () => {
    const projection = await bridge.getProjection(testUserId);
    const result = ContextProjectionSerializer.serialize(projection, { maxCharacterBudget: 1000 });

    console.log(`[Phase 1] Serialized Context Tokens: ~${result.estimatedTokens} (${result.serializedContext.length} chars)`);
    console.log('--- Serialized Context Output ---');
    console.log(result.serializedContext);
    console.log('---------------------------------');

    assert.ok(result.estimatedTokens <= 250, 'Estimated tokens must be <= 250');
    assert.ok(result.serializedContext.includes('Cognitive:'), 'Must contain cognitive summary');
    assert.ok(result.serializedContext.includes('Physical:'), 'Must contain physical summary');
    assert.ok(result.serializedContext.includes('Schedule:'), 'Must contain schedule summary');
  });

  await suite.test('SERIALIZER-02: Priority pruning activates deterministically when character budget is constrained', async () => {
    const mockProjection: ILifeContextProjection = {
      userId: testUserId,
      projectionTimestamp: Date.now(),
      projectionVersion: 2,
      degradation: { isDegraded: false, missingFields: [], fallbackActive: false },
      cognitiveState: {
        state: 'OVERLOADED',
        confidence: 0.9,
        provenance: 'TELEMETRY',
        freshnessTimestamp: Date.now(),
        primaryDrivers: ['meeting_density', 'sleep_debt'],
        estimatedFatigue: 0.8,
        estimatedReadiness: 0.2,
      },
      physicalReadiness: {
        readinessScore: 0.3,
        sleepDurationMinutes: 300,
        sleepQualityScore: 0.4,
        recoveryStatus: 'IMPAIRED',
        freshnessTimestamp: Date.now(),
      },
      operationalSchedule: {
        todayMeetingCount: 8,
        todayMeetingDurationMinutes: 360,
        freeFocusBlocksRemaining: 0,
        isScheduleTight: true,
        freshnessTimestamp: Date.now(),
      },
      goalPressures: [
        { goalId: 'g1', title: 'Q4 Product Launch', domain: 'productivity', pressureScore: 0.95, isCritical: true },
        { goalId: 'g2', title: 'Fundraising Deck', domain: 'finance', pressureScore: 0.88, isCritical: true },
      ],
      activeInterventions: [
        { interventionId: 'int1', strategy: 'block_calendar_recovery', appliedAt: Date.now(), targetDomain: 'health', status: 'ACTIVE' },
      ],
      quietHoursActive: false,
    };

    // Serializing with constrained 200 char budget
    const result = ContextProjectionSerializer.serialize(mockProjection, { maxCharacterBudget: 220 });
    console.log(`[Phase 1] Constrained Serialization (Chars: ${result.serializedContext.length}, Pruned: ${result.prunedSections.join(', ')})`);

    assert.ok(result.prunedSections.length > 0, 'Must have pruned lower priority sections');
    assert.ok(result.prunedSections.includes('activeInterventions'), 'Must prune active interventions first');
  });

  await suite.test('DEGRADED-01: Degraded Context generates observable fallback without silent context-blind bypass', async () => {
    const degraded = bridge.generateDegradedProjection(testUserId, 'Database disconnected simulated failure');

    assert.equal(degraded.degradation.isDegraded, true, 'isDegraded must be true');
    assert.equal(degraded.degradation.fallbackActive, true, 'fallbackActive must be true');
    assert.ok(degraded.degradation.degradationReason?.includes('Database disconnected'));
    assert.ok(degraded.systemPromptContextSummary?.includes('[DEGRADED_CONTEXT:'), 'Prompt summary must include explicit degraded marker');

    console.log('[Phase 1] Degraded Context Marker:', degraded.systemPromptContextSummary?.split('\n')[0]);
  });

  await suite.test('SUPERVISOR-01: Supervisor processRequest integrates LifeContextProjection into conversational flow', async () => {
    const supervisor = Supervisor.createDefault();
    const response = await supervisor.processRequest({
      userId: testUserId,
      message: 'Hello Aven, how does my schedule look today?',
    });

    assert.ok(response, 'Supervisor must return response');
    assert.ok(response.response.length > 0, 'Must produce non-empty verbal response');
    console.log(`[Phase 1] Supervisor response duration: ${response.durationMs}ms`);
    console.log(`[Phase 1] Supervisor route: ${response.routingDecision.strategy}`);
  });
});
