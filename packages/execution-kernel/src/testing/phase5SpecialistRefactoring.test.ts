import { test } from "node:test";
import assert from "node:assert/strict";
import { ProductivityAgent } from "../orchestration/specialists/ProductivityAgent";
import { HealthAgent } from "../orchestration/specialists/HealthAgent";
import { WellnessAgent } from "../orchestration/specialists/WellnessAgent";
import { AllowlistViolationError } from "../orchestration/specialists/BaseSpecialistAgent";
import { AgentTask } from "../orchestration/contracts/AgentContracts";
import { SemanticOperation } from "../orchestration/contracts/SemanticTurnContracts";

test("Phase 5: Productivity Specialist Reasons Over Structured SemanticOperation", async () => {
  const agent = new ProductivityAgent();

  const semanticOp: SemanticOperation = {
    operationId: "op_prod_01",
    domain: "productivity",
    actionType: "create_task",
    riskClass: "LOW_REVERSIBLE",
    payload: {
      title: "Deploy V2 Semantic Pipeline",
      dueDate: "2026-09-22",
      priority: "high",
    },
    dependencies: [],
    executionEligibility: "READY",
  };

  const task: AgentTask = {
    taskId: "tsk_p5_01",
    executionId: "exec_p5_01",
    domain: "productivity",
    instruction: "User requested task deployment",
    constraints: [],
    semanticOperation: semanticOp,
  };

  const projection = {
    userId: "usr_test",
    activeTasks: [],
    activeGoals: [],
    recentAccomplishments: [],
    availableCapacityMinutes: 240,
    relevantMemories: [],
  };

  const output = await agent.analyze(task, projection);
  assert.equal(output.domain, "productivity");
  assert.ok(output.proposals.length > 0, "Must produce at least one proposal");
  const proposal = output.proposals[0];
  assert.equal(proposal.actionType, "create_task");
  assert.ok(proposal.payload.title.includes("Semantic Pipeline"));
});

test("Phase 5: Health Specialist Reasons Over Structured Meal SemanticOperation", async () => {
  const agent = new HealthAgent();

  const semanticOp: SemanticOperation = {
    operationId: "op_health_01",
    domain: "health",
    actionType: "log_meal",
    riskClass: "LOW_REVERSIBLE",
    payload: {
      description: "Salmon with quinoa and asparagus",
      mealType: "dinner",
      items: [
        { name: "salmon", calories: 208, protein: 20, carbs: 0, fats: 13 },
        { name: "quinoa", calories: 120, protein: 4, carbs: 21, fats: 2 },
      ],
      totalCalories: 328,
    },
    dependencies: [],
    executionEligibility: "READY",
  };

  const task: AgentTask = {
    taskId: "tsk_p5_02",
    executionId: "exec_p5_02",
    domain: "health",
    instruction: "Log evening dinner",
    constraints: [],
    semanticOperation: semanticOp,
  };

  const projection = {
    userId: "usr_test",
    recentMeals: [],
    todayCalories: 1200,
    targetCalories: 2400,
    relevantMemories: [],
  };

  const output = await agent.analyze(task, projection);
  assert.equal(output.domain, "health");
  assert.ok(output.proposals.length > 0);
  const proposal = output.proposals[0];
  assert.equal(proposal.actionType, "log_meal");
  assert.ok(proposal.payload.description.includes("Salmon"));
});

test("Phase 5: Wellness Specialist Reasons Over Somatic Evidence & Mental Operations", async () => {
  const agent = new WellnessAgent();

  const semanticOp: SemanticOperation = {
    operationId: "op_well_01",
    domain: "wellness",
    actionType: "record_mental_estimate",
    riskClass: "LOW_REVERSIBLE",
    payload: {
      date: "2026-09-21",
      energy: 1,
      stress: 8,
      mood: 3,
      notes: "Severe mental exhaustion",
    },
    dependencies: [],
    executionEligibility: "READY",
  };

  const task: AgentTask = {
    taskId: "tsk_p5_03",
    executionId: "exec_p5_03",
    domain: "wellness",
    instruction: "Check-in mental exhaustion",
    constraints: [],
    semanticOperation: semanticOp,
    somaticEvidence: {
      reportedFatigue: true,
      energy: { value: 1, confidence: 0.95 },
      stress: { value: 8, confidence: 0.9 },
      somaticSymptoms: ["exhaustion", "brain fog"],
      rawVerbatim: "completely exhausted",
    },
  };

  const projection = {
    userId: "usr_test",
    todayMental: null,
    recentSleep: null,
    activeIncidents: [],
    relevantMemories: [],
  };

  const output = await agent.analyze(task, projection);
  assert.equal(output.domain, "wellness");
  assert.ok(output.proposals.length > 0);
  const proposal = output.proposals[0];
  assert.equal(proposal.actionType, "record_mental_estimate");
});

test("Phase 5: Allowlist Enforcement Strictly Prevents Cross-Domain Mutations", () => {
  const agent = new HealthAgent();
  assert.throws(
    () => {
      agent.validateProposals([
        {
          id: "act_illegal",
          domain: "health",
          actionType: "delete_task" as any, // Health specialist cannot delete tasks!
          payload: { taskId: "123" },
          rationale: "Unauthorized deletion attempt",
        },
      ]);
    },
    AllowlistViolationError
  );
});

test("Phase 5: Specialist Fallback Retains Delegated SemanticOperation without Dropping", async () => {
  // Create an agent whose llmProvider throws
  class FailingLLMProvider {
    async chat(): Promise<string> {
      throw new Error("Simulated LLM outage");
    }
  }

  const agent = new ProductivityAgent(new FailingLLMProvider() as any);

  const semanticOp: SemanticOperation = {
    operationId: "op_p5_fallback",
    domain: "productivity",
    actionType: "complete_task",
    riskClass: "LOW_REVERSIBLE",
    payload: {
      taskId: "task_pitch_deck_101",
    },
    dependencies: [],
    executionEligibility: "READY",
  };

  const task: AgentTask = {
    taskId: "tsk_fallback",
    executionId: "exec_fallback",
    domain: "productivity",
    instruction: "Complete pitch deck",
    constraints: [],
    semanticOperation: semanticOp,
  };

  const output = await agent.analyze(task, {});
  assert.equal(output.domain, "productivity");
  assert.equal(output.proposals.length, 1, "Must retain delegated semantic operation even during LLM provider failure");
  assert.equal(output.proposals[0].actionType, "complete_task");
  assert.equal(output.proposals[0].payload.taskId, "task_pitch_deck_101");
});
