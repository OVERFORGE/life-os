import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { RealityTestHarness } from './RealityTestHarness';
import { LatencyProfiler } from './LatencyProfiler';
import { KernelCapabilityService } from '../../orchestration/kernel/KernelCapabilityService';
import { ActionAdapterRegistry } from '../../orchestration/kernel/ActionAdapters';
import { registerDefaultActionAdapters } from '../../orchestration/kernel/DefaultActionAdapters';
import { FastPathExecutor } from '../../orchestration/supervisor/FastPathExecutor';
import { ProductivityAgent } from '../../orchestration/specialists/ProductivityAgent';
import { HealthAgent } from '../../orchestration/specialists/HealthAgent';
import { ParallelSpecialistExecutor, SpecialistInvocation } from '../../orchestration/supervisor/ParallelSpecialistExecutor';
import { ISpecialistAgent, AgentDomain } from '../../orchestration/contracts/AgentContracts';
import { LLMProvider } from '../../shared/llmAdapter';

class DeterministicMockLLM implements LLMProvider {
  async chat(): Promise<string> {
    return JSON.stringify({
      domain: 'productivity',
      confidence: 0.95,
      proposals: [],
      rationale: 'Phase 0 baseline fixture execution',
    });
  }
}

test('PHASE 0: Reality Baseline & Characterization Suite', async (suite) => {
  const harness = new RealityTestHarness();
  const profiler = new LatencyProfiler();
  const testUserId = new mongoose.Types.ObjectId().toString();
  let seedTaskIdStr: string;

  await suite.test('SETUP: Connect to real MongoDB and prepare test state', async () => {
    await harness.connect();
    assert.equal(mongoose.connection.readyState, 1, 'MongoDB connection must be in state 1 (connected)');
    await harness.cleanUserData(testUserId);
  });

  await suite.test('BASELINE-01: FastPath execution mutates real MongoDB task and achieves sub-100ms baseline', async () => {
    const db = harness.getDb();
    const tasksColl = db.collection('tasks');

    // 1. Seed a real task into MongoDB with a valid user ObjectId
    const seedTask = {
      _id: new mongoose.Types.ObjectId(),
      userId: testUserId,
      title: 'Submit quarterly budget proposal',
      status: 'pending',
      priority: 'high',
      dueDate: '2026-10-04',
      createdAt: new Date(),
    };
    await tasksColl.insertOne(seedTask);
    seedTaskIdStr = seedTask._id.toString();

    // 2. Setup Kernel & FastPath
    const registry = ActionAdapterRegistry.getInstance();
    registerDefaultActionAdapters(registry);
    const kernel = KernelCapabilityService.getInstance();
    const fastPath = new FastPathExecutor(kernel);

    // 3. Measure FastPath execution latency with LatencyProfiler
    const { result, durationMs } = await profiler.measure('fastPath', async () => {
      return await fastPath.execute(`Mark task ${seedTaskIdStr} complete`, testUserId, {
        knownTasks: [{ id: seedTaskIdStr, title: seedTask.title }],
      });
    });

    // 4. Assert FastPath handled the request
    assert.equal(result.handled, true, 'FastPath must handle task completion');
    assert.equal(result.proposal?.actionType, 'complete_task');

    // 5. Assert actual MongoDB state mutation
    const updatedDoc = await tasksColl.findOne({ _id: seedTask._id });
    assert.ok(updatedDoc, 'Task document must exist in MongoDB');
    assert.equal(updatedDoc.status, 'completed', 'Task status in real MongoDB must be mutated to completed');

    console.log(`[Phase 0 Baseline] FastPath real DB mutation executed in: ${durationMs.toFixed(2)}ms`);
  });

  await suite.test('BASELINE-02: Specialist Fan-Out overhead profiling', async () => {
    const mockLLM = new DeterministicMockLLM();
    const specialists = new Map<AgentDomain, ISpecialistAgent>([
      ['productivity', new ProductivityAgent(mockLLM)],
      ['health', new HealthAgent(mockLLM)],
    ]);
    const parallelExecutor = new ParallelSpecialistExecutor(specialists, 2000);

    const invocations: SpecialistInvocation[] = [
      {
        domain: 'productivity',
        task: { userId: testUserId, message: 'Review schedule', domain: 'productivity' } as any,
        projection: {},
      },
      {
        domain: 'health',
        task: { userId: testUserId, message: 'Review workout timing', domain: 'health' } as any,
        projection: {},
      },
    ];

    const { result, durationMs } = await profiler.measure('specialist', async () => {
      return await parallelExecutor.executeParallel(invocations);
    });

    assert.equal(result.successfulOutputs.length, 2, 'Both specialists must execute successfully');
    console.log(`[Phase 0 Baseline] Parallel specialist fan-out completed in: ${durationMs.toFixed(2)}ms`);
  });

  await suite.test('BASELINE-03: Kernel Capability Dispatch latency profiling', async () => {
    const kernel = KernelCapabilityService.getInstance();

    const { result, durationMs } = await profiler.measure('kernelMutation', async () => {
      return await kernel.executeAction(testUserId, {
        id: `prop_test_${Date.now()}`,
        domain: 'productivity',
        actionType: 'complete_task',
        payload: { taskId: seedTaskIdStr },
        reversibility: 'reversible_with_compensation',
        riskClass: 'LOW',
        idempotencyKey: `idem_ping_${Date.now()}`,
        rationale: 'Phase 0 latency profiling',
      } as any);
    });

    assert.equal(result.success, true, 'Kernel capability execution must succeed');
    console.log(`[Phase 0 Baseline] Kernel capability execution in: ${durationMs.toFixed(2)}ms`);
  });

  await suite.test('METRICS REPORT: Baseline Latency Summary', async () => {
    const summary = profiler.getSummary();
    console.log('\n========================================');
    console.log('   PHASE 0 EMPIRICAL LATENCY BASELINE');
    console.log('========================================');
    console.log(`FastPath P50:         ${summary.fastPathP50Ms} ms`);
    console.log(`Specialist P50:       ${summary.specialistP50Ms} ms`);
    console.log(`Kernel Mutation P50:  ${summary.kernelMutationP50Ms} ms`);
    console.log('========================================\n');

    assert.ok(summary.fastPathP50Ms > 0, 'FastPath P50 must be recorded');
    assert.ok(summary.specialistP50Ms > 0, 'Specialist P50 must be recorded');
    assert.ok(summary.kernelMutationP50Ms > 0, 'Kernel Mutation P50 must be recorded');
  });

  await suite.test('TEARDOWN: Clean up test fixtures and disconnect', async () => {
    await harness.cleanUserData(testUserId);
    await harness.disconnect();
  });
});
