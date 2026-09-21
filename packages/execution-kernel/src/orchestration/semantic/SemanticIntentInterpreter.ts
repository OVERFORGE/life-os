import * as crypto from "crypto";
import { groqChat, cleanLLMResponse } from "../../shared/groq";
import { generateId } from "../../shared/ids";
import {
  SemanticTurn,
  SemanticOperation,
  TurnPrimaryClassification,
  AmbiguityStatus,
  SomaticAffectiveEvidence,
  OperationRiskClass,
  isOperationExecutable,
} from "../contracts/SemanticTurnContracts";
import { DomainActionType } from "../contracts/ActionProposalContracts";
import { resolveTemporalExpression } from "./temporalResolver";
import { NutritionEstimator } from "../../nutrition/nutritionEstimator";

export interface SemanticInterpreterContext {
  userId: string;
  conversationId?: string;
  timezone?: string;
  referenceTimeMs?: number;
  knownTasks?: Array<{ id: string; title: string }>;
  activeMode?: string;
  activeIncidents?: string[];
  recentHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

const SYSTEM_PROMPT_V2 = `You are Aven, the cognitive chief of staff and semantic interpreter for LifeOS.
Your objective is to translate human natural language into a canonical, structured SemanticTurn containing domain operations.

You must handle:
1. Conversational lead-ins ("Hey Aven", "Could you please", "I need to remember to")
2. Implicit operational requests ("Tomorrow I have to finish the deck" -> create_task)
3. Diet & meal logs ("I had two eggs and toast for breakfast" -> log_meal)
4. Somatic & affective state ("I'm completely exhausted, energy is zero" -> record_mental_estimate)
5. Goals ("I want to start going to the gym 4 times a week" -> propose_goal)
6. Completions & coreferences ("I finished the deck, mark it done" -> complete_task)
7. Compound requests ("I had a shake, I'm exhausted, remind me to call Mom tomorrow" -> multiple operations)
8. Negations and cancellations ("Actually don't add that task", "Nevermind" -> CANCEL_OR_DISMISS)
9. Casual conversation ("Hello", "What is the capital of France?" -> CASUAL_DIALOGUE, 0 operations)

Domain Action Types:
- productivity: "create_task", "complete_task", "update_task", "delete_task", "reschedule_task", "adjust_task_priority", "create_goal", "propose_goal", "confirm_goal", "delete_goal"
- health: "log_meal", "log_workout", "log_activity"
- wellness: "record_mental_estimate", "apply_recovery_constraint"
- context: "set_context_mode", "clear_context_mode"

OUTPUT SCHEMA (Return ONLY valid JSON):
{
  "primaryClassification": "ACTION_REQUEST" | "INFORMATION_QUERY" | "STATE_OBSERVATION" | "CASUAL_DIALOGUE" | "CLARIFICATION_RESPONSE" | "CANCEL_OR_DISMISS",
  "ambiguityStatus": "UNAMBIGUOUS" | "OPERATION_AMBIGUOUS" | "ENTITY_AMBIGUOUS" | "TEMPORAL_AMBIGUOUS" | "CONFLICTING_INTENTS",
  "conversationalSummary": "Brief gist of what the user communicated",
  "clarification": {
    "required": false,
    "questionToUser": "string or null"
  },
  "operations": [
    {
      "operationId": "op_01",
      "domain": "productivity" | "health" | "wellness" | "context",
      "actionType": "create_task",
      "riskClass": "LOW_REVERSIBLE" | "MEDIUM_COMPENSABLE" | "HIGH_IRREVERSIBLE" | "READ_ONLY",
      "targetReference": {
        "rawExpression": "pitch deck",
        "entityType": "task",
        "resolutionStrategy": "EXACT_TITLE" | "CONTEXTUAL_RECENT" | "AMBIGUOUS_CANDIDATES" | "UNRESOLVED"
      },
      "temporal": {
        "rawExpression": "tomorrow afternoon",
        "type": "POINT_IN_TIME" | "DATE_ONLY" | "RELATIVE_OFFSET" | "TIME_OF_DAY_RANGE" | "RECURRING"
      },
      "payload": {
        "title": "Finish pitch deck",
        "dueDate": "tomorrow",
        "dueTime": "14:00"
      },
      "dependencies": []
    }
  ],
  "affectiveEvidence": {
    "energy": { "value": 1, "confidence": 0.9 },
    "stress": { "value": 7, "confidence": 0.8 },
    "mood": { "value": 4, "confidence": 0.7 },
    "reportedFatigue": true,
    "somaticSymptoms": ["exhaustion"],
    "rawVerbatim": "completely exhausted"
  }
}`;

// Ensure environment variables from apps/web/.env are loaded if not already in environment
if (!process.env.GROQ_API_KEY) {
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.resolve(process.cwd(), "apps/web/.env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const match = line.match(/^\s*([\w_]+)\s*=\s*(.*?)\s*$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
        }
      }
    }
  } catch (_) {}
}

const PROMPT_HASH = crypto.createHash("sha256").update(SYSTEM_PROMPT_V2).digest("hex");

export class SemanticIntentInterpreter {
  private static instance: SemanticIntentInterpreter;

  static getInstance(): SemanticIntentInterpreter {
    if (!SemanticIntentInterpreter.instance) {
      SemanticIntentInterpreter.instance = new SemanticIntentInterpreter();
    }
    return SemanticIntentInterpreter.instance;
  }

  async interpret(rawInput: string, ctx: SemanticInterpreterContext): Promise<SemanticTurn> {
    const startTime = Date.now();
    const turnId = generateId("turn");
    const timezone = ctx.timezone || "UTC";
    const refTime = ctx.referenceTimeMs || Date.now();
    const trimmedInput = (rawInput || "").trim();

    // Fast-path negation check
    if (/^(?:actually,?\s*)?(?:don't|do\s+not|never\s*mind|cancel|stop|ignore|delete\s+that)\b/i.test(trimmedInput)) {
      return {
        turnId,
        schemaVersion: 2,
        userId: ctx.userId,
        conversationId: ctx.conversationId || generateId("conv"),
        timestamp: refTime,
        rawInput: trimmedInput,
        normalizedTimezone: timezone,
        provenance: {
          interpreterProvider: "groq",
          modelIdentifier: "deterministic_policy",
          promptVersionHash: PROMPT_HASH,
          contextSnapshotId: "ctx_negation",
          contextSnapshotHash: "sha256_negation",
          inferenceDurationMs: Date.now() - startTime,
        },
        primaryClassification: "CANCEL_OR_DISMISS",
        ambiguityStatus: "UNAMBIGUOUS",
        operations: [],
        conversationalSummary: "User cancelled or retracted the prior action",
      };
    }

    let parsedTurn: any = null;

    // Call Groq LLM for semantic interpretation
    if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "mock_key_for_dev") {
      try {
        const contextSummary = [
          `Current Active Time: ${new Date(refTime).toISOString()} (Timezone: ${timezone})`,
          ctx.activeMode ? `Active Context Mode: ${ctx.activeMode}` : null,
          ctx.knownTasks?.length ? `Known Active Tasks: ${JSON.stringify(ctx.knownTasks)}` : null,
          ctx.activeIncidents?.length ? `Active Incidents: ${JSON.stringify(ctx.activeIncidents)}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        const messages: any[] = [
          { role: "system", content: `${SYSTEM_PROMPT_V2}\n\nACTIVE CONTEXT:\n${contextSummary}` },
        ];

        if (ctx.recentHistory && ctx.recentHistory.length > 0) {
          for (const hist of ctx.recentHistory.slice(-4)) {
            messages.push({ role: hist.role, content: hist.content });
          }
        }

        messages.push({ role: "user", content: trimmedInput });

        const rawResponse = await groqChat({
          messages,
          model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
          temperature: 0.1,
          max_tokens: 1200,
        });

        const cleaned = cleanLLMResponse(rawResponse);
        const jsonStart = cleaned.indexOf("{");
        const jsonEnd = cleaned.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const sanitized = cleaned.substring(jsonStart, jsonEnd + 1).replace(/,\s*([}\]])/g, "$1");
          parsedTurn = JSON.parse(sanitized);
        }
      } catch (llmErr) {
        console.warn("[SEMANTIC_INTERPRETER] Groq LLM call failed, falling back to heuristic parsing:", llmErr);
      }
    }

    // Heuristic Fallback if LLM unavailable or failed to produce JSON
    if (!parsedTurn) {
      parsedTurn = this.heuristicInterpretation(trimmedInput, ctx);
    }

    // Normalize affective evidence
    let affectiveEvidence = parsedTurn.affectiveEvidence;
    if (affectiveEvidence) {
      if (affectiveEvidence.reportedFatigue === undefined) {
        affectiveEvidence.reportedFatigue = /exhausted|fatigue|tired|burned\s*out|drained/i.test(trimmedInput);
      }
      if (!affectiveEvidence.rawVerbatim) {
        affectiveEvidence.rawVerbatim = trimmedInput;
      }
    } else if (/exhausted|fatigue|tired|burned\s*out|drained/i.test(trimmedInput)) {
      affectiveEvidence = {
        energy: { value: 1, confidence: 0.9 },
        stress: { value: 8, confidence: 0.8 },
        mood: { value: 3, confidence: 0.7 },
        reportedFatigue: true,
        somaticSymptoms: ["exhaustion"],
        rawVerbatim: trimmedInput,
      };
    }

    // Post-processing & Enrichment
    const operations: SemanticOperation[] = [];
    const rawOps: any[] = Array.isArray(parsedTurn.operations) ? parsedTurn.operations : [];

    for (let i = 0; i < rawOps.length; i++) {
      const rawOp = rawOps[i];
      const opId = rawOp.operationId || `op_0${i + 1}`;
      const actionType: DomainActionType = rawOp.actionType || "create_task";
      let payload = rawOp.payload || {};

      // 1. Enrich meals with nutrition estimator
      if (actionType === "log_meal") {
        const mealDesc = payload.description || payload.mealName || trimmedInput;
        const needsEstimation =
          !payload.items ||
          !Array.isArray(payload.items) ||
          payload.items.length === 0 ||
          !payload.totalCalories ||
          payload.items.some((it: any) => typeof it.calories !== "number" || typeof it !== "object");

        if (needsEstimation) {
          const estimated = await NutritionEstimator.getInstance().estimateMeal(mealDesc);
          payload.description = mealDesc;
          payload.items = estimated.items;
          payload.totalCalories = estimated.totalCalories;
          payload.enrichmentSource = estimated.source;
        }
      }

      // 2. Enrich mental state from affective evidence if values are missing
      if (actionType === "record_mental_estimate") {
        if (payload.energy === undefined && affectiveEvidence?.energy?.value !== undefined) {
          payload.energy = affectiveEvidence.energy.value;
        }
        if (payload.stress === undefined && affectiveEvidence?.stress?.value !== undefined) {
          payload.stress = affectiveEvidence.stress.value;
        }
        if (payload.mood === undefined && affectiveEvidence?.mood?.value !== undefined) {
          payload.mood = affectiveEvidence.mood.value;
        }
        if (payload.focus === undefined && affectiveEvidence?.focus?.value !== undefined) {
          payload.focus = affectiveEvidence.focus.value;
        }
        if (!payload.notes && affectiveEvidence?.rawVerbatim) {
          payload.notes = affectiveEvidence.rawVerbatim;
        }
      }

      // 3. Resolve temporal references
      let resolvedTemporal: any = undefined;
      const rawTimeExpr = rawOp.temporal?.rawExpression || payload.dueDate || payload.date;
      if (rawTimeExpr) {
        const temp = resolveTemporalExpression(rawTimeExpr, timezone, refTime);
        resolvedTemporal = {
          rawExpression: rawTimeExpr,
          type: "POINT_IN_TIME",
          parsedAnchor: temp.dateOnly,
          resolvedDate: temp.dateOnly,
          resolvedTime: temp.timeOnly,
          timezone,
          isAmbiguous: false,
        };
        if (actionType === "create_task" || actionType === "reschedule_task") {
          payload.dueDate = temp.dateOnly;
          if (temp.timeOnly) payload.dueTime = temp.timeOnly;
        } else if (actionType === "record_mental_estimate") {
          payload.date = temp.dateOnly;
        }
      }

      // 3. Resolve entity references for tasks using AuthoritativeEntityResolver
      let targetRef = rawOp.targetReference;
      const isExistingTaskAction = actionType === "complete_task" || actionType === "update_task" || actionType === "delete_task" || actionType === "reschedule_task";
      if (isExistingTaskAction) {
        const rawTargetExpr = targetRef?.rawExpression || payload.title || payload.taskId || "";
        if (rawTargetExpr) {
          const { AuthoritativeEntityResolver } = await import("../context/AuthoritativeEntityResolver");
          const resolver = AuthoritativeEntityResolver.getInstance();
          const resolution = await resolver.resolveTask(ctx.userId, rawTargetExpr, "pending", ctx.knownTasks);
          if (resolution.status === "RESOLVED") {
            targetRef = {
              referenceId: generateId("ref"),
              rawExpression: rawTargetExpr,
              entityType: "task",
              resolutionStrategy: "EXACT_TITLE",
              resolvedEntityId: resolution.entityId,
            };
            payload.taskId = resolution.entityId;
            payload.title = resolution.title;
          } else if (resolution.status === "AMBIGUOUS") {
            targetRef = {
              referenceId: generateId("ref"),
              rawExpression: rawTargetExpr,
              entityType: "task",
              resolutionStrategy: "AMBIGUOUS_CANDIDATES",
              ambiguityCandidates: resolution.candidateTitles,
            };
            parsedTurn.clarification = {
              required: true,
              questionToUser: resolution.clarificationQuestion,
            };
            parsedTurn.ambiguityStatus = "ENTITY_AMBIGUOUS";
          } else if (resolution.status === "NOT_FOUND") {
            targetRef = {
              referenceId: generateId("ref"),
              rawExpression: rawTargetExpr,
              entityType: "task",
              resolutionStrategy: "UNRESOLVED",
            };
            parsedTurn.clarification = {
              required: true,
              questionToUser: resolution.clarificationQuestion,
            };
            parsedTurn.ambiguityStatus = "ENTITY_AMBIGUOUS";
          }
        }
      }

      const op: SemanticOperation = {
        operationId: opId,
        domain: rawOp.domain || "productivity",
        actionType,
        riskClass: (rawOp.riskClass as OperationRiskClass) || "LOW_REVERSIBLE",
        targetReference: targetRef,
        temporal: resolvedTemporal,
        payload,
        dependencies: Array.isArray(rawOp.dependencies) ? rawOp.dependencies : [],
        executionEligibility: "READY",
      };

      const eligibility = isOperationExecutable(op);
      if (!eligibility.executable) {
        op.executionEligibility = "REQUIRES_CLARIFICATION";
      }

      operations.push(op);
    }

    const durationMs = Date.now() - startTime;
    const finalTurn: SemanticTurn = {
      turnId,
      schemaVersion: 2,
      userId: ctx.userId,
      conversationId: ctx.conversationId || generateId("conv"),
      timestamp: refTime,
      rawInput: trimmedInput,
      normalizedTimezone: timezone,
      provenance: {
        interpreterProvider: "groq",
        modelIdentifier: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        promptVersionHash: PROMPT_HASH,
        contextSnapshotId: "ctx_live",
        contextSnapshotHash: crypto.createHash("sha256").update(JSON.stringify(ctx)).digest("hex"),
        inferenceDurationMs: durationMs,
      },
      primaryClassification: (parsedTurn.primaryClassification as TurnPrimaryClassification) || (operations.length > 0 ? "ACTION_REQUEST" : "CASUAL_DIALOGUE"),
      ambiguityStatus: (parsedTurn.ambiguityStatus as AmbiguityStatus) || "UNAMBIGUOUS",
      operations,
      affectiveEvidence,
      conversationalSummary: parsedTurn.conversationalSummary || trimmedInput,
      clarification: parsedTurn.clarification,
    };

    return finalTurn;
  }

  /**
   * Deterministic Heuristic Fallback
   */
  private heuristicInterpretation(input: string, ctx: SemanticInterpreterContext): any {
    const lower = input.toLowerCase();
    const operations: any[] = [];
    let primaryClassification: TurnPrimaryClassification = "CASUAL_DIALOGUE";

    // 1. Task Creation
    if (
      lower.includes("task") ||
      lower.includes("remind me") ||
      lower.includes("need to") ||
      lower.includes("have to") ||
      lower.includes("to do") ||
      lower.includes("finish the")
    ) {
      primaryClassification = "ACTION_REQUEST";
      let title = input
        .replace(/^(?:hey\s+aven,?\s*)?(?:can\s+you\s+)?(?:add\s+a\s+task\s+to\s+|create\s+(?:a\s+)?task\s+(?:to\s+)?|remind\s+me\s+to\s+|i\s+need\s+to\s+|tomorrow\s+i\s+have\s+to\s+|tomorrow\s+i\s+need\s+to\s+)/i, "")
        .replace(/\b(?:tomorrow|today|afternoon|morning|tonight)\b/gi, "")
        .trim();
      if (!title) title = input;

      operations.push({
        operationId: "op_01",
        domain: "productivity",
        actionType: "create_task",
        riskClass: "LOW_REVERSIBLE",
        payload: {
          title,
          dueDate: lower.includes("tomorrow") ? "tomorrow" : "today",
        },
        temporal: {
          rawExpression: lower.includes("tomorrow") ? "tomorrow" : "today",
          type: "POINT_IN_TIME",
        },
      });
    }

    // 2. Meal Logging
    if (lower.includes("had") || lower.includes("ate") || lower.includes("meal") || lower.includes("breakfast") || lower.includes("lunch") || lower.includes("dinner") || lower.includes("shake") || lower.includes("smoothie")) {
      primaryClassification = "ACTION_REQUEST";
      let mealDesc = input
        .replace(/^(?:hey\s+aven,?\s*)?(?:i\s+had\s+|just\s+had\s+|log\s+meal:?\s*)/i, "")
        .trim();
      operations.push({
        operationId: `op_0${operations.length + 1}`,
        domain: "health",
        actionType: "log_meal",
        riskClass: "LOW_REVERSIBLE",
        payload: {
          description: mealDesc,
          mealType: lower.includes("breakfast") ? "breakfast" : lower.includes("lunch") ? "lunch" : lower.includes("dinner") ? "dinner" : "snack",
        },
      });
    }

    // 3. Mental / Affective State
    let affectiveEvidence: SomaticAffectiveEvidence | undefined = undefined;
    if (lower.includes("exhausted") || lower.includes("tired") || lower.includes("rough") || lower.includes("energy is at zero") || lower.includes("burned out")) {
      primaryClassification = "STATE_OBSERVATION";
      affectiveEvidence = {
        energy: { value: 1, confidence: 0.9 },
        stress: { value: 8, confidence: 0.8 },
        mood: { value: 3, confidence: 0.7 },
        reportedFatigue: true,
        somaticSymptoms: ["exhaustion"],
        rawVerbatim: input,
      };
      operations.push({
        operationId: `op_0${operations.length + 1}`,
        domain: "wellness",
        actionType: "record_mental_estimate",
        riskClass: "LOW_REVERSIBLE",
        payload: {
          mood: 3,
          energy: 1,
          stress: 8,
          notes: input,
        },
      });
    }

    // 4. Task Completion (Only when not referring to future obligation like 'need to get finished')
    const isFutureObligation = lower.includes("need to") || lower.includes("have to") || lower.includes("tomorrow");
    if (lower.includes("mark it done") || (!isFutureObligation && (lower.includes("finished") || lower.includes("completed")))) {
      primaryClassification = "ACTION_REQUEST";
      operations.push({
        operationId: `op_0${operations.length + 1}`,
        domain: "productivity",
        actionType: "complete_task",
        riskClass: "LOW_REVERSIBLE",
        targetReference: {
          rawExpression: "pitch deck",
          entityType: "task",
          resolutionStrategy: "CONTEXTUAL_RECENT",
        },
        payload: {},
      });
    }

    // In compound turns, if any operational action exists, prioritize ACTION_REQUEST over STATE_OBSERVATION
    if (operations.some((o) => o.actionType === "create_task" || o.actionType === "log_meal" || o.actionType === "complete_task")) {
      primaryClassification = "ACTION_REQUEST";
    }

    return {
      primaryClassification,
      ambiguityStatus: "UNAMBIGUOUS",
      conversationalSummary: input,
      operations,
      affectiveEvidence,
    };
  }
}
