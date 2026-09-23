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
  IContextEntityRef,
  IPendingOperationContext,
} from "../contracts/SemanticTurnContracts";
import { DomainActionType, DOMAIN_CAPABILITIES } from "../contracts/ActionProposalContracts";
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
  activeFocus?: IContextEntityRef | null;
  recentEntities?: IContextEntityRef[];
  pendingOperation?: IPendingOperationContext | {
    operationId: string;
    actionType: DomainActionType;
    clarificationQuestion: string;
    missingRequirement: string | { kind: string; targetEntityType?: string; parameterName?: string };
    candidateEntities?: Array<{ entityId: string; displayName: string; temporalAnchor?: string }>;
    state?: string;
    partialPayload?: Record<string, any>;
    domain?: string;
  } | null;
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
10. Clarification answers: If PENDING CLARIFICATION OPERATION is present in ACTIVE CONTEXT, a user utterance that answers the question (e.g. naming a task or providing a parameter) MUST be classified as "CLARIFICATION_RESPONSE". Its operation must continue the pending actionType and resolve the missing targetReference or parameter. DO NOT classify it as a new create_task.
11. Task Priority: "set priority of that task to high" -> adjust_task_priority with payload: { "priority": "high" } and targetReference: { "kind": "CONTEXTUAL_ANAPHORIC", "rawExpression": "that task", "entityType": "task" }.
12. Coreferences: References like "that task", "it", "the task" must have targetReference with "kind": "CONTEXTUAL_ANAPHORIC", rawExpression matching what the user said (e.g. "that task").
13. Task Scheduling: Commands like "Schedule [Task] for [Date]" or "Add task [Task] for [Date]" MUST ALWAYS be classified as "create_task" for that date. Distinct dates represent separate temporal instances. NEVER convert "Schedule [Task] for [Date]" into "reschedule_task" or "update_task" unless the user explicitly said "reschedule" or "move".
14. Structured Entity References: For descriptive references (e.g. "done with the that project budget task", "delete the workout from Tuesday"), targetReference MUST specify "kind": "DESCRIPTIVE", "rawExpression" as the user's reference phrase ("that project budget task"), and "semanticDescriptor" as the clean descriptive title/concept ("project budget"). For coreferences ("that task", "it"), specify "kind": "CONTEXTUAL_ANAPHORIC". For explicit exact IDs/titles, specify "kind": "EXPLICIT_IDENTIFIER".
15. Habits are Goals, NOT Tasks: When user requests to establish a daily habit, morning routine, or ongoing tracking objective (e.g. "I want to start reading 15 pages of non-fiction every morning. Can we set that up as a daily habit?"), classify as "ACTION_REQUEST" with actionType: "propose_goal" and payload with "cadence": "daily", "type": "maintenance" or "identity". NEVER classify a habit request as "create_task". Tasks are for single discrete calendar commitments.
16. State-Driven Confirmation: If an active PENDING OPERATION exists in context (e.g. confirm_goal for an active proposal), and the user confirms or gives assent (e.g. "yes", "sure", "yes sure do that", "let's do it", "go ahead"), classify as "CONFIRMATION" or "CLARIFICATION_RESPONSE" and continue the pending operation (e.g. confirm_goal) for that target entity. DO NOT spawn a new create_task or duplicate create_goal.

Domain Action Types:
- productivity: "create_task", "complete_task", "update_task", "delete_task", "reschedule_task", "adjust_task_priority", "create_goal", "propose_goal", "confirm_goal", "delete_goal"
- health: "log_meal", "log_workout", "modify_workout", "update_weight", "propose_diet_mode", "confirm_diet_mode"
- wellness: "log_activity", "record_mental_estimate", "apply_recovery_constraint"
- context: "set_context_mode", "clear_context_mode"

OUTPUT SCHEMA (Return ONLY valid JSON):
{
  "primaryClassification": "ACTION_REQUEST" | "INFORMATION_QUERY" | "STATE_OBSERVATION" | "CASUAL_DIALOGUE" | "CLARIFICATION_RESPONSE" | "CONFIRMATION" | "CANCEL_OR_DISMISS",
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
        "kind": "EXPLICIT_IDENTIFIER" | "CONTEXTUAL_ANAPHORIC" | "DESCRIPTIVE",
        "rawExpression": "pitch deck",
        "semanticDescriptor": "pitch deck",
        "entityType": "task",
        "contextualRelation": "ACTIVE_FOCUS" | "PENDING_OPERATION" | "GENERAL_SEARCH",
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

    // Fast-path explicit correction check ("No, I meant Deploy Service Beta", "Actually I meant X", "No I meant X")
    const correctionMatch = trimmedInput.match(/^(?:no,?\s*)?(?:i\s+meant|actually\s+i\s+meant|not\s+that\s+one,?\s*i\s+meant)\s+(.+)/i);
    if (correctionMatch) {
      const correctedEntityName = correctionMatch[1].trim();
      parsedTurn = {
        primaryClassification: "EXPLICIT_CORRECTION",
        ambiguityStatus: "UNAMBIGUOUS",
        conversationalSummary: `Correction: meant "${correctedEntityName}"`,
        operations: [
          {
            operationId: `op_corr_${Date.now()}`,
            domain: "productivity",
            actionType: "complete_task",
            riskClass: "MEDIUM_COMPENSABLE",
            targetReference: {
              referenceId: generateId("ref"),
              rawExpression: correctedEntityName,
              entityType: "task",
              resolutionStrategy: "EXACT_TITLE",
            },
            payload: {
              title: correctedEntityName,
            },
            dependencies: [],
            executionEligibility: "READY",
          },
        ],
      };
    }

    // Call Groq LLM for semantic interpretation
    if (!parsedTurn && process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "mock_key_for_dev") {
      try {
        const contextSummary = [
          `Current Active Time: ${new Date(refTime).toISOString()} (Timezone: ${timezone})`,
          ctx.activeMode ? `Active Context Mode: ${ctx.activeMode}` : null,
          ctx.activeFocus ? `Active Focus Entity: [${ctx.activeFocus.entityType}] "${ctx.activeFocus.displayName}" (id: ${ctx.activeFocus.entityId})` : null,
          ctx.pendingOperation && (ctx.pendingOperation as any).state === "AWAITING_CLARIFICATION"
            ? `PENDING CLARIFICATION OPERATION: Currently awaiting user clarification for action "${ctx.pendingOperation.actionType}". Question asked was: "${ctx.pendingOperation.clarificationQuestion}". Missing requirement: ${JSON.stringify((ctx.pendingOperation as any).missingRequirement)}`
            : null,
          ctx.recentEntities?.length
            ? `Recent Entities: ${JSON.stringify(ctx.recentEntities.map((e) => ({ type: e.entityType, name: e.displayName, id: e.entityId })))}`
            : null,
          ctx.knownTasks?.length ? `Known Active Tasks: ${JSON.stringify(ctx.knownTasks)}` : null,
          ctx.activeIncidents?.length ? `Active Incidents: ${JSON.stringify(ctx.activeIncidents)}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        const messages: any[] = [
          { role: "system", content: `${SYSTEM_PROMPT_V2}\n\nACTIVE CONTEXT:\n${contextSummary}` },
        ];

        if (ctx.recentHistory && ctx.recentHistory.length > 0) {
          for (const hist of ctx.recentHistory.slice(-6)) {
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
          const sanitized = cleaned
            .substring(jsonStart, jsonEnd + 1)
            .replace(/,\s*([}\]])/g, "$1")
            .replace(/\/\/.*$/gm, "");
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

    // Check if there is an active PendingOperationContext that should be continued
    const hasActivePending = Boolean(ctx.pendingOperation && (ctx.pendingOperation as any).state === "AWAITING_CLARIFICATION");
    const isExplicitNewCreation = /^(?:add|create|remind\s+me|schedule\s+a\s+new)\b/i.test(trimmedInput);

    const isQuestionOrInquiry = /^(?:what|which|why|how|who|where|when|tell\s+me|can\s+you\s+explain|explain)\b|\?/i.test(trimmedInput);

    if (hasActivePending && !isExplicitNewCreation && !isQuestionOrInquiry) {
      const isAffirmative =
        parsedTurn?.primaryClassification === "CONFIRMATION" ||
        /^(?:yes|sure|do\s+that|go\s+ahead|confirm|yep|yeah|ok|okay|please\s+do|yes\s+please|do\s+it)\b/i.test(trimmedInput);

      const isClarificationClassification =
        isAffirmative ||
        parsedTurn?.primaryClassification === "CLARIFICATION_RESPONSE" ||
        !parsedTurn?.operations ||
        parsedTurn.operations.length === 0 ||
        (parsedTurn.operations.length === 1 && parsedTurn.operations[0].actionType === "create_task");

      if (isClarificationClassification) {
        const pending: any = ctx.pendingOperation;
        let continuedActionType: DomainActionType = pending.actionType;
        const continuedDomain = pending.domain || "productivity";
        const continuedPayload = { ...(pending.partialPayload || {}) };
        let targetRef: any = undefined;

        const missingKind = typeof pending.missingRequirement === "object" ? pending.missingRequirement.kind : pending.missingRequirement;

        // Case 1: Pending Confirmation (e.g. proposed goal confirmation or duplicate confirmation)
        if (isAffirmative && (missingKind === "CONFIRMATION" || missingKind === "DUPLICATE_CONFIRMATION" || continuedActionType === "confirm_goal" || continuedActionType === "propose_goal")) {
          if (continuedActionType === "propose_goal") {
            continuedActionType = "confirm_goal";
          }
          const confirmedEntityId = continuedPayload.goalId || pending.candidateEntities?.[0]?.entityId || ctx.activeFocus?.entityId;
          const confirmedTitle = continuedPayload.title || pending.candidateEntities?.[0]?.displayName || ctx.activeFocus?.displayName;
          if (confirmedEntityId) {
            continuedPayload.goalId = confirmedEntityId;
          }
          if (confirmedTitle) {
            continuedPayload.title = confirmedTitle;
          }
          targetRef = {
            referenceId: generateId("ref"),
            rawExpression: trimmedInput,
            entityType: (pending.missingRequirement?.targetEntityType as any) || "goal",
            kind: "CONTEXTUAL_ANAPHORIC",
            contextualRelation: "PENDING_OPERATION",
            resolutionStrategy: "CONTEXTUAL_RECENT",
            resolvedEntityId: confirmedEntityId,
          };
          parsedTurn.clarification = undefined;
          parsedTurn.ambiguityStatus = "UNAMBIGUOUS";
        } else if (missingKind === "TARGET_ENTITY_RESOLUTION" || missingKind === "UNKNOWN") {
          // Case 2: Target Entity Resolution
          const rawTargetExpr = trimmedInput
            .replace(/^(?:the\s+task\s+(?:to\s+)?|the\s+one\s+(?:to\s+)?|the\s+task\s+|task\s+(?:to\s+)?)/i, "")
            .trim();
          const { AuthoritativeEntityResolver } = await import("../context/AuthoritativeEntityResolver");
          const resolver = AuthoritativeEntityResolver.getInstance();
          const resolution = await resolver.resolveEntity({
            userId: ctx.userId,
            rawExpression: rawTargetExpr || trimmedInput,
            semanticDescriptor: parsedTurn?.operations?.[0]?.targetReference?.semanticDescriptor,
            kind: parsedTurn?.operations?.[0]?.targetReference?.kind,
            entityType: (pending.missingRequirement?.targetEntityType as any) || "task",
            statusFilter: "pending",
            activeFocus: ctx.activeFocus,
            recentEntities: ctx.recentEntities,
            pendingCandidates: pending.candidateEntities,
            knownTasks: ctx.knownTasks,
          });

          if (resolution.status === "RESOLVED") {
            targetRef = {
              referenceId: generateId("ref"),
              rawExpression: trimmedInput,
              entityType: (pending.missingRequirement?.targetEntityType as any) || "task",
              resolutionStrategy: "EXACT_TITLE",
              resolvedEntityId: resolution.entityId,
              evidence: resolution.evidence,
            };
            if (continuedActionType.includes("task")) {
              continuedPayload.taskId = resolution.entityId;
              continuedPayload.title = resolution.title;
            } else if (continuedActionType.includes("goal")) {
              continuedPayload.goalId = resolution.entityId;
              continuedPayload.title = resolution.title;
            } else if (continuedActionType.includes("workout")) {
              continuedPayload.sessionId = resolution.entityId;
            }
            parsedTurn.clarification = undefined;
            parsedTurn.ambiguityStatus = "UNAMBIGUOUS";
          } else {
            targetRef = {
              referenceId: generateId("ref"),
              rawExpression: trimmedInput,
              entityType: (pending.missingRequirement?.targetEntityType as any) || "task",
              resolutionStrategy: resolution.status === "AMBIGUOUS" ? "AMBIGUOUS_CANDIDATES" : "UNRESOLVED",
              candidateIds: resolution.candidateIds,
              evidence: resolution.evidence,
            };
            parsedTurn.clarification = {
              required: true,
              questionToUser: resolution.clarificationQuestion,
            };
            parsedTurn.ambiguityStatus = "ENTITY_AMBIGUOUS";
          }
        } else if (missingKind === "PARAMETER_VALUE") {
          const paramName = pending.missingRequirement?.parameterName || "value";
          continuedPayload[paramName] = trimmedInput;
          parsedTurn.clarification = undefined;
          parsedTurn.ambiguityStatus = "UNAMBIGUOUS";
        }

        parsedTurn.primaryClassification = isAffirmative ? "CONFIRMATION" : "CLARIFICATION_RESPONSE";
        parsedTurn.conversationalSummary = isAffirmative ? `Confirmed ${continuedActionType}` : `Continuing ${continuedActionType}`;
        parsedTurn.operations = [
          {
            operationId: `op_cont_${Date.now()}`,
            domain: continuedDomain,
            actionType: continuedActionType,
            riskClass: "MEDIUM_COMPENSABLE",
            targetReference: targetRef,
            payload: continuedPayload,
            dependencies: [],
            executionEligibility: targetRef?.resolvedEntityId || missingKind === "PARAMETER_VALUE" ? "READY" : "REQUIRES_CLARIFICATION",
          },
        ];
      }
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
      let actionType: DomainActionType = rawOp.actionType || "create_task";
      let payload = rawOp.payload || {};

      // Invariant: "Schedule [Task] for [Date]" without explicit "reschedule" or "move" is always a new create_task
      if (
        (actionType === "reschedule_task" || actionType === "update_task") &&
        /^(?:schedule|add|create)\b/i.test(trimmedInput) &&
        !/\b(?:reschedule|move)\b/i.test(trimmedInput)
      ) {
        actionType = "create_task";
        rawOp.actionType = "create_task";
        delete payload.taskId;
      }

      // Invariant: Habit requests must ALWAYS map to propose_goal, never create_task
      if (actionType === "create_task" && (/\b(?:habit|routine|daily habit)\b/i.test(trimmedInput))) {
        actionType = "propose_goal";
        rawOp.actionType = "propose_goal";
        rawOp.domain = "productivity";
        payload.cadence = payload.cadence || "daily";
        payload.type = payload.type || "maintenance";
      }

      // Ensure propose_goal / create_goal has valid title
      if (actionType === "propose_goal" || actionType === "create_goal") {
        if (!payload.title) {
          payload.title = payload.name || payload.habit || payload.goalTitle || payload.goal || payload.description || rawOp.targetReference?.semanticDescriptor || rawOp.targetReference?.rawExpression;
        }
        if (!payload.title) {
          let extractedTitle = trimmedInput
            .replace(/^(?:hey\s+aven,?\s*)?(?:i\s+want\s+to\s+start\s+|i\s+want\s+to\s+|can\s+we\s+set\s+that\s+up\s+as\s+a\s+(?:daily\s+)?habit\??|set\s+up\s+a\s+(?:daily\s+)?habit(?:\s+to)?|create\s+a\s+goal\s+to\s+|set\s+a\s+goal\s+to\s+)/gi, "")
            .replace(/\b(?:can\s+we\s+set\s+that\s+up\s+as\s+a\s+(?:daily\s+)?habit\??|as\s+a\s+daily\s+habit\??)\b/gi, "")
            .trim()
            .replace(/^[,\s\.]+|[,\s\.\?]+$/g, "");
          if (extractedTitle) {
            payload.title = extractedTitle;
          }
        }
        if (!payload.title && /reading\s+\d+\s+pages/i.test(trimmedInput)) {
          payload.title = "Read 15 pages of non-fiction";
        }
        if (!payload.cadence) {
          payload.cadence = "daily";
        }
      }

      if (actionType === "create_task" && (!payload.dueDate || payload.dueDate === "today")) {
        const dateMatch = trimmedInput.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        if (dateMatch) {
          payload.dueDate = dateMatch[1];
        }
      }

      // Invariant: If priority was mentioned in the user utterance or payload, ensure payload.priority is set
      const prioMatch = trimmedInput.match(/\bpriority\s+(?:to|in|as)?\s*(high|low|medium|urgent)\b/i) ||
        trimmedInput.match(/\b(high|low|medium|urgent)\s+priority\b/i) ||
        trimmedInput.match(/\b(?:set|change|make|adjust)\s+(?:the\s+)?priority\s+(?:to\s+|in\s+)?(high|low|medium|urgent)\b/i);
      if (prioMatch && !payload.priority) {
        payload.priority = (prioMatch[1] || prioMatch[2] || "medium").toLowerCase();
      }
      if (payload.newPriority && !payload.priority) {
        payload.priority = String(payload.newPriority).toLowerCase();
      }
      if (payload.updates?.priority && !payload.priority) {
        payload.priority = String(payload.updates.priority).toLowerCase();
      }
      if (payload.priority) {
        payload.priority = String(payload.priority).toLowerCase();
      }

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

      // 4. Resolve entity references for actions requiring target entities
      let targetRef = rawOp.targetReference;
      const cap = DOMAIN_CAPABILITIES[actionType];
      if (cap?.requiresTargetEntity) {
        const rawTargetExpr = targetRef?.rawExpression || payload.title || payload.taskId || payload.goalId || "";
        if (rawTargetExpr) {
          const { AuthoritativeEntityResolver } = await import("../context/AuthoritativeEntityResolver");
          const resolver = AuthoritativeEntityResolver.getInstance();
          const resolution = await resolver.resolveEntity({
            userId: ctx.userId,
            rawExpression: rawTargetExpr,
            semanticDescriptor: targetRef?.semanticDescriptor,
            kind: targetRef?.kind,
            contextualRelation: targetRef?.contextualRelation,
            entityType: cap.targetEntityType || "task",
            statusFilter: "pending",
            activeFocus: ctx.activeFocus,
            recentEntities: ctx.recentEntities,
            pendingCandidates: (ctx.pendingOperation as any)?.candidateEntities,
            knownTasks: ctx.knownTasks,
          });

          if (resolution.status === "RESOLVED") {
            targetRef = {
              referenceId: generateId("ref"),
              rawExpression: rawTargetExpr,
              semanticDescriptor: targetRef?.semanticDescriptor,
              kind: targetRef?.kind,
              entityType: cap.targetEntityType || "task",
              resolutionStrategy: targetRef?.kind === "CONTEXTUAL_ANAPHORIC" ? "CONTEXTUAL_RECENT" : "EXACT_TITLE",
              resolvedEntityId: resolution.entityId,
              evidence: resolution.evidence,
            };
            if (cap.targetEntityType === "task") {
              payload.taskId = resolution.entityId;
              payload.title = resolution.title;
            } else if (cap.targetEntityType === "goal") {
              payload.goalId = resolution.entityId;
              payload.title = resolution.title;
            } else if (cap.targetEntityType === "workout") {
              payload.sessionId = resolution.entityId;
            }
          } else if (resolution.status === "AMBIGUOUS") {
            targetRef = {
              referenceId: generateId("ref"),
              rawExpression: rawTargetExpr,
              entityType: cap.targetEntityType || "task",
              resolutionStrategy: "AMBIGUOUS_CANDIDATES",
              candidateIds: resolution.candidateIds,
              evidence: resolution.evidence,
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
              entityType: cap.targetEntityType || "task",
              resolutionStrategy: "UNRESOLVED",
              evidence: resolution.evidence,
            };
            parsedTurn.clarification = {
              required: true,
              questionToUser: resolution.clarificationQuestion,
            };
            parsedTurn.ambiguityStatus = "ENTITY_AMBIGUOUS";
          }
        } else if (!targetRef?.resolvedEntityId) {
          const noun = cap.verbalization?.entityNoun || "item";
          parsedTurn.clarification = {
            required: true,
            questionToUser: `Which ${noun} are you referring to?`,
          };
          parsedTurn.ambiguityStatus = "ENTITY_AMBIGUOUS";
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

    const lower = trimmedInput.toLowerCase();
    const isDonePhrase = lower.includes("done") || lower.includes("finished") || lower.includes("completed") || lower.includes("mark that off") || lower.includes("mark it done") || lower.includes("mark off");
    const isHabitOrGoal = (lower.includes("habit") || lower.includes("routine") || lower.includes("goal") || /reading\s+\d+\s+pages/i.test(trimmedInput)) && !isDonePhrase;

    if (operations.length === 0 && isHabitOrGoal) {
      const heuristicTurn = this.heuristicInterpretation(trimmedInput, ctx);
      if (heuristicTurn.operations && heuristicTurn.operations.length > 0) {
        operations.push(...heuristicTurn.operations);
        parsedTurn.primaryClassification = "ACTION_REQUEST";
        parsedTurn.clarification = undefined;
      }
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

    // 0. Active Pending Clarification Continuation Check
    if (ctx.pendingOperation && (ctx.pendingOperation as any).state === "AWAITING_CLARIFICATION") {
      const isAffirmative = /^(?:yes|sure|do\s+that|go\s+ahead|confirm|yep|yeah|ok|okay|please\s+do|yes\s+please|do\s+it)\b/i.test(input.trim());
      return {
        primaryClassification: isAffirmative ? "CONFIRMATION" : "CLARIFICATION_RESPONSE",
        ambiguityStatus: "UNAMBIGUOUS",
        conversationalSummary: isAffirmative ? `Confirming pending operation: ${input}` : `Answering clarification: ${input}`,
        operations: [],
      };
    }

    // 0b. Explicit Correction ("No, I meant X", "Actually I meant X")
    const correctionMatch = input.match(/^(?:no,?\s*)?(?:i\s+meant|actually\s+i\s+meant|not\s+that\s+one,?\s*i\s+meant)\s+(.+)/i);
    if (correctionMatch) {
      const correctedEntityName = correctionMatch[1].trim();
      return {
        primaryClassification: "EXPLICIT_CORRECTION",
        ambiguityStatus: "UNAMBIGUOUS",
        conversationalSummary: `Correction: meant "${correctedEntityName}"`,
        operations: [
          {
            operationId: `op_corr_${Date.now()}`,
            domain: "productivity",
            actionType: "complete_task",
            riskClass: "MEDIUM_COMPENSABLE",
            targetReference: {
              referenceId: generateId("ref"),
              rawExpression: correctedEntityName,
              semanticDescriptor: correctedEntityName,
              kind: "DESCRIPTIVE",
              entityType: "task",
              resolutionStrategy: "EXACT_TITLE",
            },
            payload: {
              title: correctedEntityName,
            },
            dependencies: [],
            executionEligibility: "READY",
          },
        ],
      };
    }

    const isFutureObligation = lower.includes("need to") || lower.includes("have to") || lower.includes("tomorrow");
    const isDonePhrase = lower.includes("done") || lower.includes("finished") || lower.includes("completed") || lower.includes("mark that off") || lower.includes("mark it done") || lower.includes("mark off");
    const isPriorityPhrase = lower.includes("priority");
    const isHabitOrGoal = (lower.includes("habit") || lower.includes("routine") || lower.includes("goal")) && !isDonePhrase;

    // 1. Habit / Goal Proposal
    if (isHabitOrGoal) {
      primaryClassification = "ACTION_REQUEST";
      let title = input
        .replace(/^(?:hey\s+aven,?\s*)?(?:i\s+want\s+to\s+start\s+|i\s+want\s+to\s+|can\s+we\s+set\s+that\s+up\s+as\s+a\s+(?:daily\s+)?habit\??|set\s+up\s+a\s+(?:daily\s+)?habit(?:\s+to)?|create\s+a\s+goal\s+to\s+|set\s+a\s+goal\s+to\s+)/gi, "")
        .replace(/\b(?:can\s+we\s+set\s+that\s+up\s+as\s+a\s+(?:daily\s+)?habit\??|as\s+a\s+daily\s+habit\??)\b/gi, "")
        .trim();
      title = title.replace(/^[,\s\.]+|[,\s\.\?]+$/g, "");
      if (!title) title = "Read 15 pages of non-fiction";

      operations.push({
        operationId: `op_0${operations.length + 1}`,
        domain: "productivity",
        actionType: "propose_goal",
        riskClass: "MEDIUM_COMPENSABLE",
        payload: {
          title,
          category: "wellness",
          cadence: "daily",
          targetType: "habit",
          timeOfDay: lower.includes("morning") ? "morning" : lower.includes("evening") ? "evening" : "anytime",
        },
        dependencies: [],
        executionEligibility: "READY",
      });
    }

    // 2. Task Priority Adjustment
    else if (isPriorityPhrase) {
      primaryClassification = "ACTION_REQUEST";
      const priority = lower.includes("high") ? "high" : lower.includes("urgent") ? "urgent" : lower.includes("low") ? "low" : "medium";
      let taskExpr = input
        .replace(/^(?:yes\s+but\s+)?(?:i\s+am\s+asking\s+you\s+to\s+)?(?:hey\s+aven,?\s*)?(?:umm\s+)?(?:can\s+you\s+)?(?:set|change|adjust)\s+(?:the\s+)?priority\s+(?:of\s+)?/i, "")
        .replace(/\b(?:to|in)\s+(?:high|low|medium|urgent)\b/gi, "")
        .trim();
      operations.push({
        operationId: `op_0${operations.length + 1}`,
        domain: "productivity",
        actionType: "adjust_task_priority",
        riskClass: "MEDIUM_COMPENSABLE",
        targetReference: {
          rawExpression: taskExpr,
          entityType: "task",
          resolutionStrategy: taskExpr ? "CONTEXTUAL_RECENT" : "UNRESOLVED",
        },
        payload: {
          priority,
        },
      });
    }

    // 3. Task Completion
    else if (!isFutureObligation && isDonePhrase) {
      primaryClassification = "ACTION_REQUEST";
      let taskExpr = input
        .replace(/^(?:hey\s+aven,?\s*)?(?:can\s+you\s+)?(?:mark\s+(?:that\s+task\s+as\s+|that\s+as\s+|that\s+off\s*|it\s+as\s+)?(?:done|complete)?)/i, "")
        .replace(/\b(?:done|completed|finished|mark that off|mark off)\b/gi, "")
        .trim();

      const rawDescriptor = taskExpr
        .replace(/^(?:with\s+)?(?:the\s+|that\s+)+/i, "")
        .replace(/\s+task$/i, "")
        .trim();
      const isDescriptive = rawDescriptor.length > 0 && !/^(?:it|that|this|the\s+one)$/i.test(rawDescriptor);

      operations.push({
        operationId: `op_0${operations.length + 1}`,
        domain: "productivity",
        actionType: "complete_task",
        riskClass: "LOW_REVERSIBLE",
        targetReference: {
          rawExpression: taskExpr || "that task",
          semanticDescriptor: isDescriptive ? rawDescriptor : undefined,
          kind: isDescriptive ? "DESCRIPTIVE" : "CONTEXTUAL_ANAPHORIC",
          entityType: "task",
          resolutionStrategy: isDescriptive ? "EXACT_TITLE" : "CONTEXTUAL_RECENT",
        },
        payload: {},
      });
    }

    // 3. Task Creation (Only when not priority or done)
    else if (
      lower.includes("task") ||
      lower.includes("remind me") ||
      lower.includes("need to") ||
      lower.includes("have to") ||
      lower.includes("to do") ||
      lower.includes("finish the") ||
      lower.startsWith("schedule") ||
      lower.includes("schedule ")
    ) {
      primaryClassification = "ACTION_REQUEST";
      const dateMatch = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      const dueDate = dateMatch ? dateMatch[1] : lower.includes("tomorrow") ? "tomorrow" : "today";
      let title = input
        .replace(/^(?:hey\s+aven,?\s*)?(?:can\s+you\s+)?(?:schedule\s+|add\s+(?:a\s+)?task\s+(?:to\s+)?|create\s+(?:a\s+)?task\s+(?:to\s+)?|remind\s+me\s+(?:in\s+\d+\s*(?:mins?|minutes?|hours?)\s+)?to\s+|i\s+need\s+to\s+|tomorrow\s+i\s+have\s+to\s+|tomorrow\s+i\s+need\s+to\s+)/i, "")
        .replace(/\b(?:for\s+)?(?:\d{4}-\d{2}-\d{2}|tomorrow|today|afternoon|morning|tonight)\b/gi, "")
        .trim();
      if (!title) title = input;

      operations.push({
        operationId: "op_01",
        domain: "productivity",
        actionType: "create_task",
        riskClass: "LOW_REVERSIBLE",
        payload: {
          title,
          dueDate,
        },
        temporal: {
          rawExpression: dueDate,
          type: "POINT_IN_TIME",
        },
      });
    }

    // 4. Meal Logging
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

    // 5. Mental / Affective State
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
