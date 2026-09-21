import test from "node:test";
import assert from "node:assert/strict";
import {
  AVEN_IDENTITY,
  buildAvenIdentityDeclaration,
  buildAvenPersonaGuidelines,
  buildAvenCommunicationPolicy,
  buildAvenEpistemicPolicy,
  buildAvenInteractionPolicy,
  buildGlobalAvenIdentityPrompt,
  buildSupervisorPersonaPrompt,
  buildFastPathPersonaPrompt,
  buildReActPersonaPrompt,
  buildSpecialistPersonaPrompt,
  buildSynthesisPersonaPrompt,
  findForbiddenPhrases,
  FORBIDDEN_PHRASES,
} from "../persona";
import { FastPathExecutor } from "../orchestration/supervisor/FastPathExecutor";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { SynthesisEngine } from "../orchestration/synthesis/SynthesisEngine";
import { ProductivityAgent } from "../orchestration/specialists/ProductivityAgent";
import { HealthAgent } from "../orchestration/specialists/HealthAgent";
import { WellnessAgent } from "../orchestration/specialists/WellnessAgent";

test("Persona 1: Canonical Identity & Distinct System Separation", () => {
  // Canonical identity invariants
  assert.equal(AVEN_IDENTITY.name, "Aven");
  assert.equal(AVEN_IDENTITY.canonicalExpansion, "Adaptive Vitality & Execution Nexus");
  assert.equal(AVEN_IDENTITY.platform, "LifeOS");
  assert.equal(AVEN_IDENTITY.canonicalUserName, "Daksh");

  // Global identity declaration verifies strict separation
  const decl = buildAvenIdentityDeclaration();
  assert.ok(decl.includes("You are Aven"));
  assert.ok(decl.includes("LifeOS is the underlying operating system"));
  assert.ok(decl.includes("Daksh"));
  assert.ok(decl.includes("Principal ↔ Trusted Intelligence"));
  assert.ok(decl.includes("Never confuse or collapse these identities"));
});

test("Persona 2: Anti-Generic Cliché Policy & Prohibited Terms", () => {
  // Prohibited clichés must include generic chatbot phrases and 'Sir'
  assert.ok(FORBIDDEN_PHRASES.includes("As an AI"));
  assert.ok(FORBIDDEN_PHRASES.includes("I'd be happy to help"));
  assert.ok(FORBIDDEN_PHRASES.includes("Great question"));
  assert.ok(FORBIDDEN_PHRASES.includes("How may I assist you"));
  assert.ok(FORBIDDEN_PHRASES.includes("Sir,"));

  const testText = "Hello Sir, as an AI I'd be happy to help you with that great question!";
  const found = findForbiddenPhrases(testText);
  assert.ok(found.length >= 3, `Expected at least 3 forbidden phrases detected, found: ${found.join(", ")}`);

  const cleanText = "Done. I've added the task for tomorrow. The constraint you set earlier remains active.";
  const cleanFound = findForbiddenPhrases(cleanText);
  assert.equal(cleanFound.length, 0);
});

test("Persona 3: User Addressing Policy (Daksh Natural Usage)", () => {
  const commPolicy = buildAvenCommunicationPolicy("Daksh");
  // Daksh must be used naturally and purposefully, never mechanically prepended
  assert.ok(commPolicy.includes("Daksh"));
  assert.ok(commPolicy.includes("NEVER mechanically prepend or append \"Daksh\""));
  assert.ok(commPolicy.includes("Do NOT address the user as \"Sir\""));
});

test("Persona 4: Epistemic Rigor & Suppression of Internal Mechanics", () => {
  const epistemic = buildAvenEpistemicPolicy();
  assert.ok(epistemic.includes("Inference is never fact") || epistemic.includes("INFERENCE IS NEVER FACT"));
  assert.ok(epistemic.includes("Explicit Knowledge"));
  assert.ok(epistemic.includes("Observed Knowledge"));
  assert.ok(epistemic.includes("Inferred Knowledge"));
  assert.ok(epistemic.includes("SUPPRESS INTERNAL MECHANICS") || epistemic.includes("LEAK PREVENTION"));
  // Terms that must never be casually leaked to user
  assert.ok(epistemic.includes("Supervisor"));
  assert.ok(epistemic.includes("DAG"));
  assert.ok(epistemic.includes("ReAct loop"));
});

test("Persona 5: Kernel Authority Boundary & Action Truthfulness", () => {
  const interaction = buildAvenInteractionPolicy();
  assert.ok(interaction.includes("Intelligence Proposes. Deterministic Systems Decide and Execute."));
  assert.ok(interaction.includes("NEVER state \"Done.\"") || interaction.includes("NEVER state \"Done.\" merely because an LLM"));
  assert.ok(interaction.includes("authoritative execution response confirms"));
});

test("Persona 6: Specialist Domain Identity Architecture (Unified Voice)", () => {
  const prodAgent = new ProductivityAgent();
  const healthAgent = new HealthAgent();
  const wellnessAgent = new WellnessAgent();

  const prodPrompt = prodAgent.buildSystemPrompt({ id: "t1", goal: "plan work" } as any, {} as any);
  const healthPrompt = healthAgent.buildSystemPrompt({ id: "t2", goal: "workout" } as any, {} as any);
  const wellnessPrompt = wellnessAgent.buildSystemPrompt({ id: "t3", goal: "check recovery" } as any, {} as any);

  // Invariant: Specialists are internal reasoning modules for Aven, NOT independent chatbot personalities
  assert.ok(prodPrompt.includes("Aven's internal Productivity Reasoning Specialist"));
  assert.ok(prodPrompt.includes("You do NOT possess an independent personality"));
  assert.ok(healthPrompt.includes("Aven's internal Health Reasoning Specialist"));
  assert.ok(healthPrompt.includes("You do NOT possess an independent personality"));
  assert.ok(wellnessPrompt.includes("Aven's internal Wellness Reasoning Specialist"));
  assert.ok(wellnessPrompt.includes("You do NOT possess an independent personality"));
});

test("Persona 7: FastPath Action Confirmation Truthfulness in Aven Voice", async () => {
  const registry = new ActionAdapterRegistry();
  registry.register("complete_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (p) => ({ taskId: p.payload.taskId, status: "completed" }),
    compensate: async () => ({ compensated: true }),
  });

  const kernelService = new KernelCapabilityService(registry);
  const fastPath = new FastPathExecutor(kernelService);

  const result = await fastPath.execute("complete task 456", "user_test_aven");
  assert.equal(result.handled, true);
  // Semantic verification: Confirm persistence in composed, clean voice without servant filler
  assert.ok(result.userResponse.includes("456"));
  assert.ok(result.userResponse.startsWith("Done.") || result.userResponse.includes("completed"));
  assert.equal(findForbiddenPhrases(result.userResponse).length, 0);
  assert.ok(!result.userResponse.includes("for you"));
  assert.ok(!result.userResponse.includes("Sir"));
  assert.ok(!result.userResponse.includes("DAG"));
});

test("Persona 8: FastPath Error Handling Preserves Composed Voice Without Crash Leaks", async () => {
  const registry = new ActionAdapterRegistry();
  // Action that fails validation
  registry.register("complete_task", {
    validatePreconditions: async () => ({ valid: false, reason: "Task does not exist" }),
    execute: async () => { throw new Error("Should not execute"); },
    compensate: async () => ({ compensated: true }),
  });

  const kernelService = new KernelCapabilityService(registry);
  const fastPath = new FastPathExecutor(kernelService);

  const result = await fastPath.execute("complete task 999", "user_test_aven");
  assert.equal(result.handled, true);
  // Semantic verification: State failure honestly without robotic cliché
  assert.ok(result.userResponse.includes("I couldn't complete that request"));
  assert.ok(result.userResponse.includes("Task does not exist"));
  assert.ok(!result.userResponse.includes("An unexpected error occurred"));
  assert.ok(!result.userResponse.includes("Error:"));
  assert.equal(findForbiddenPhrases(result.userResponse).length, 0);
});

test("Persona 9: Synthesis Engine Fallbacks Maintain Aven Voice", () => {
  const engine = new SynthesisEngine();

  // Synthesis with proposals should return structured outcome in Aven voice
  const resultWithProposals = engine.synthesize(
    [
      {
        agentId: "prod-1",
        domain: "productivity",
        proposals: [
          {
            id: "act-1",
            domain: "productivity",
            actionType: "create_goal",
            targetEntityId: "g1",
            payload: { title: "Ship Aven Identity" },
            preconditions: {},
            rationale: "Align persona architecture",
            reversibility: "reversible",
            idempotencyKey: "k1",
          },
        ],
        confidence: 0.95,
      } as any,
    ],
    "Create goal to ship Aven identity"
  );

  assert.ok(resultWithProposals.summary.includes("Ship Aven Identity"));
  assert.equal(findForbiddenPhrases(resultWithProposals.summary).length, 0);
  assert.ok(!resultWithProposals.summary.includes("How can I assist you next?"));

  // Synthesis empty fallback
  const resultEmpty = engine.synthesize([], "Status check");
  assert.ok(resultEmpty.summary.includes("in sync") || resultEmpty.summary.includes("Everything is reviewed"));
  assert.equal(findForbiddenPhrases(resultEmpty.summary).length, 0);
});

test("Persona 10: Layered Prompt Composer Output Rigor", () => {
  const supervisorPrompt = buildSupervisorPersonaPrompt("Daksh");
  const fastPathPrompt = buildFastPathPersonaPrompt("Daksh");
  const reactPrompt = buildReActPersonaPrompt("Daksh");
  const synthesisPrompt = buildSynthesisPersonaPrompt("Daksh");

  for (const p of [supervisorPrompt, fastPathPrompt, reactPrompt, synthesisPrompt]) {
    assert.ok(p.includes("Aven"));
    assert.ok(p.includes("LifeOS"));
    assert.ok(p.includes("Daksh"));
    assert.ok(p.includes("COMMUNICATION POLICY"));
    assert.ok(p.includes("EPISTEMIC DISCIPLINE"));
    assert.ok(p.includes("INTERACTION POLICY"));
  }
});

test("Persona 11: Dynamic User Resolution (Adapts to Active User Name)", async () => {
  // When user is someone else (e.g. Alex)
  const alexSupervisorPrompt = buildSupervisorPersonaPrompt("Alex");
  assert.ok(alexSupervisorPrompt.includes("Your user is Alex"));
  assert.ok(alexSupervisorPrompt.includes("The user's name is Alex"));
  assert.ok(!alexSupervisorPrompt.includes("Your user is Daksh"));

  // Verify Supervisor uses dynamic user name in greetings and context
  const { Supervisor } = await import("../orchestration/supervisor/Supervisor");
  const supervisor = Supervisor.getInstance();

  const responseSarah = await supervisor.processRequest({
    userId: "user_sarah_1",
    userName: "Sarah",
    message: "hello",
  });

  // Must address Sarah, not Daksh
  assert.ok(responseSarah.response.includes("Sarah"), `Expected greeting to include 'Sarah', got: ${responseSarah.response}`);
  assert.ok(!responseSarah.response.includes("Daksh"), `Greeting should not mention Daksh for Sarah: ${responseSarah.response}`);
  assert.equal(findForbiddenPhrases(responseSarah.response).length, 0);

  // When userName is omitted, falls back to canonical default (Daksh)
  const responseDefault = await supervisor.processRequest({
    userId: "user_default_1",
    message: "hey",
  });
  assert.ok(responseDefault.response.includes("Daksh"), `Expected default greeting to include 'Daksh', got: ${responseDefault.response}`);
});

test("Persona 12: First Name Extraction & Natural Addressing (No Full Name Address)", async () => {
  const { extractFirstName } = await import("../persona");

  assert.equal(extractFirstName("Daksh Kaushal"), "Daksh");
  assert.equal(extractFirstName("Sarah Connor"), "Sarah");
  assert.equal(extractFirstName("  alexander  "), "Alexander");
  assert.equal(extractFirstName(""), "Daksh");
  assert.equal(extractFirstName(undefined), "Daksh");

  const commPolicy = buildAvenCommunicationPolicy("Daksh Kaushal");
  assert.ok(commPolicy.includes("The user's name is Daksh (first name only)."));
  assert.ok(commPolicy.includes("ALWAYS address the user by their first name only (Daksh)"));
  assert.ok(!commPolicy.includes("Daksh Kaushal"));

  // Supervisor greeting for full name must use first name only
  const { Supervisor } = await import("../orchestration/supervisor/Supervisor");
  const supervisor = Supervisor.getInstance();

  const responseFullName = await supervisor.processRequest({
    userId: "user_full_name_1",
    userName: "Daksh Kaushal",
    message: "hello",
  });
  assert.ok(responseFullName.response.includes("Daksh"), `Expected greeting with first name 'Daksh', got: ${responseFullName.response}`);
  assert.ok(!responseFullName.response.includes("Daksh Kaushal"), `Greeting should NOT include full name 'Daksh Kaushal': ${responseFullName.response}`);
});

test("Persona 13: Strict Prohibition of Expansion Reciting & Support Clichés", () => {
  const identityDecl = buildAvenIdentityDeclaration();
  assert.ok(identityDecl.includes("NEVER recite"));
  assert.ok(identityDecl.includes("Adaptive Vitality & Execution Nexus"));
  assert.ok(identityDecl.includes("when asked for your name, when introducing yourself, or in casual chat"));

  // Customer support clichés must be forbidden
  const forbiddenSupport1 = "How can I support you today, Daksh?";
  const found1 = findForbiddenPhrases(forbiddenSupport1);
  assert.ok(found1.length >= 1, `Expected 'How can I support you today' detected, found: ${found1.join(", ")}`);

  const forbiddenSupport2 = "What can I do for you today?";
  const found2 = findForbiddenPhrases(forbiddenSupport2);
  assert.ok(found2.length >= 1, `Expected 'What can I do for you today' detected, found: ${found2.join(", ")}`);
});

test("Persona 14: Grounded Capability Boundaries & Negative Grounding", () => {
  const { buildAvenCapabilityBoundaries } = require("../persona");
  const boundaries = buildAvenCapabilityBoundaries();

  // Authentic LifeOS capabilities
  assert.ok(boundaries.includes("Tasks & Execution"));
  assert.ok(boundaries.includes("Goals & Life Seasons"));
  assert.ok(boundaries.includes("Health & Workouts"));
  assert.ok(boundaries.includes("Nutrition Strategy"));
  assert.ok(boundaries.includes("Wellness & Cognitive Load"));
  assert.ok(boundaries.includes("Daily Briefings"));

  // Strict negative boundaries (anti-hallucination)
  assert.ok(boundaries.includes("NO external meeting scheduling or calendar invitations"));
  assert.ok(boundaries.includes("NO generic document / note-taking repository"));
  assert.ok(boundaries.includes("NO corporate enterprise OKR management"));

  // Verify supervisor prompt includes capability boundaries
  const supervisorPrompt = buildSupervisorPersonaPrompt("Daksh");
  assert.ok(supervisorPrompt.includes("CAPABILITY BOUNDARIES & GROUNDED REALITY"));
  assert.ok(supervisorPrompt.includes("AUTHENTIC LIFEOS CAPABILITIES"));
});


