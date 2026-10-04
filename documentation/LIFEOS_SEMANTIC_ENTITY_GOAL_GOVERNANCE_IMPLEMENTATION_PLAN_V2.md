# LIFEOS — SEMANTIC ENTITY RESOLUTION, GOAL GOVERNANCE & DIALOGUE AWARENESS
## ARCHITECTURAL SPECIFICATION & REVISED IMPLEMENTATION PLAN (V2)

> **Document Version:** 2.0 (Authoritative Forensic Specification)  
> **Status:** Completed Design Specification — Awaiting User Approval before Execution  
> **Target Subsystems:** Semantic Intent Interpreter, Cognitive Supervisor, Authoritative Entity Resolver, Goal Lifecycle & Adapters, Grounded Response Synthesis, Short-Term Memory (STM)  
> **Hard Rule:** Zero production code modifications during planning mode; strict closed-loop validation against live MongoDB Atlas cluster.

---

## 1. Exact Root Causes

Forensic investigation of the user's two real-world interactions confirmed four interlocking architectural defects:

| Defect ID | User Symptom | Subsystem | Precise Root Cause |
|:---|:---|:---|:---|
| **RC-1** | *"I couldn't find a pending task matching 'done with the that project budget task'"* | `SemanticIntentInterpreter` & `AuthoritativeEntityResolver` | Semantic interpreter passed the entire utterance into `rawExpression`. The entity resolver lacks awareness of semantic reference kinds, and relies solely on strict contiguous substring equality (`target.includes(query)`). It could not resolve the user's intent to the `activeFocus` task (*"Send updated project budget to Michael"*) despite 100% semantic descriptor match. |
| **RC-2** | *"I've proposed that goal: 'goal'."* | `handleCreateGoal.ts` & `GroundedResponseGenerator.ts` | `handleCreateGoal.ts` returned `{ type: "create_goal", success: true, data: { title: goal.title } }`, omitting `goalId` and `title` at the root of `executionData`. `GroundedResponseGenerator` checked `data?.title`, found `undefined` (nested under `data.data.title`), and fell back to the hardcoded noun string `"goal"`. Furthermore, omitting `goalId` prevented `Supervisor` from recording the goal in STM `activeFocus`. |
| **RC-3** | Duplicate goals created silently in MongoDB | `Goal.ts` & `DefaultActionAdapters.ts` | `GoalSchema` in `apps/web/features/goals/models/Goal.ts` completely lacks a `status` field. `CreateGoalAdapter.validatePreconditions` queries `{ status: { $in: ["active", "proposed"] } }`, which matches 0 documents because `status` is never persisted. Duplicate detection was a complete no-op. Two identical active goals with title *"Read 15 pages of non-fiction"* were persisted in MongoDB. |
| **RC-4** | *"what goal ?"* triggered generic Aven intro; confirmation created a task | `Supervisor.ts` & `SemanticIntentInterpreter.ts` | The `CONVERSATIONAL_LLM` branch in `Supervisor.ts` passed only message history, completely omitting `activeFocus` and recent operations from the bounded context projection. When asked *"what goal ?"*, the model suffered total context amnesia. When user said *"yes sure do that"*, the interpreter lacked a state-driven confirmation mapping to the pending goal proposal and defaulted to `create_task`. |

---

## 2. Current Architecture Traces

### Trace 1: The Descriptive Task Completion Failure
```
[User Utterance]: "done with the that project budget task"
  │
  ▼ (Supervisor.ts:144)
SemanticIntentInterpreter.interpret(...)
  │ [LLM Output]: actionType: "complete_task", targetReference: { rawExpression: "done with the that project budget task" }
  │
  ▼ (SemanticIntentInterpreter.ts:489)
AuthoritativeEntityResolver.resolveEntity({ rawExpression: "done with the that project budget task", entityType: "task" })
  │
  ├─ cleanExpr = "done with the that project budget task" (only stripped leading "the task to")
  ├─ Check activeFocus ("Send updated project budget to Michael"):
  │    isAnaphoric = false
  │    "Send updated project budget to Michael".includes("done with the that project budget task") === FALSE
  ├─ MongoDB Query:
  │    Task.find({ title: { $regex: "done with the that project budget task", $options: "i" } })
  │    Returned: [] (0 matches)
  ▼
Status: "NOT_FOUND"
Clarification: "I couldn't find a pending task matching 'done with the that project budget task'. Could you clarify the task title?"
```

### Trace 2: The Goal Proposal Naming & Duplication Failure
```
[User Utterance]: "I want to start reading 15 pages of non-fiction every morning. Can we set that up as a daily habit?"
  │
  ▼ (SemanticIntentInterpreter.ts)
actionType: "propose_goal", payload: { title: "Read 15 pages of non-fiction" }
  │
  ▼ (CreateGoalAdapter.validatePreconditions)
Goal.findOne({ title: "Read 15 pages of non-fiction", status: { $in: ["active", "proposed"] } })
  │ Returned: null (because GoalSchema has NO status field; all goals have status === undefined)
  │ Precondition check passes!
  │
  ▼ (handleCreateGoal.ts:44)
Goal.create({ title: "Read 15 pages of non-fiction", cadence: "daily", userId })
  │ Returns: { type: "create_goal", success: true, data: { title: "Read 15 pages of non-fiction" } }
  │ (Notice: goalId and title are missing at top-level; no status stored)
  │
  ▼ (Supervisor.ts:451)
entityId = res.targetEntityId || res.data?.taskId || res.data?.goalId || res.data?._id;
  │ entityId === undefined!
  │ activeFocus IS NOT UPDATED in STM!
  │
  ▼ (GroundedResponseGenerator.ts:120)
title = data?.title || data?.goal?.title || "goal";
  │ data.title is undefined! data.goal is undefined!
  │ Emits: "I've proposed that goal: 'goal'."
```

---

## 3. Corrected Architecture

The corrected architecture enforces strict subsystem boundaries with zero natural language parsing in the resolver and zero regex intent routing:

```
Human Language (Voice or Web)
       │
       ▼
1. Semantic Interpretation Layer (Aven / SemanticIntentInterpreter)
   - Translates human language into structured SemanticTurn
   - Emits rich, strongly-typed EntityReference (kind: "DESCRIPTIVE" | "CONTEXTUAL_ANAPHORIC" | "EXPLICIT_IDENTIFIER")
   - Extracts clean semanticDescriptor ("project budget") separate from rawExpression
   - Recognizes state-driven confirmation/continuation of active PendingOperationContext
       │
       ▼
2. Cognitive Supervisor (Supervisor.ts)
   - Provides identical BoundedContextProjection to both interpreter and CONVERSATIONAL_LLM
   - Manages state machine of PendingOperationContext (CREATED → AWAITING_CONFIRMATION → CONTINUED)
   - Bridges confirmed proposals to concrete execution capabilities
       │
       ▼
3. Authoritative Entity Resolution Layer (AuthoritativeEntityResolver.ts)
   - NEVER parses natural language; receives structured EntityReference
   - Resolves structured semanticDescriptor against live authoritative MongoDB state
   - Resolves CONTEXTUAL_ANAPHORIC references against STM activeFocus directly
   - Enforces Material Ambiguity Safety: strictly CLARIFY if multiple database candidates match
       │
       ▼
4. Sovereign Kernel Boundary (KernelCapabilityService & DefaultActionAdapters)
   - Schema validation & deterministic precondition verification
   - Enforces database-level duplicate governance and concurrency protection
   - Emits canonical ICanonicalExecutionEntity with normalized entityId, displayName, entityType
       │
       ▼
5. Authoritative MongoDB State Persistence
   - GoalSchema with persisted status, confirmedAt, and partial unique index
       │
       ▼
6. Grounded First-Person Synthesis (GroundedResponseGenerator.ts)
   - Consumes canonical ICanonicalExecutionEntity directly
   - Zero fallback chains; zero "goal" string placeholders; zero third-person prompt leakage
```

---

## 4. Semantic Reference Contract

The existing `EntityReference` contract in [`SemanticTurnContracts.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/orchestration/contracts/SemanticTurnContracts.ts) is extended with structured semantic metadata so that Aven expresses meaning without the resolver needing to clean English:

```typescript
export type SemanticReferenceKind =
  | "EXPLICIT_IDENTIFIER"     // Exact database ID or verbatim exact title
  | "CONTEXTUAL_ANAPHORIC"   // Coreference ("that task", "it", "the one we just discussed")
  | "DESCRIPTIVE";           // Descriptive concept ("project budget", "reading habit")

export interface EntityReference {
  referenceId: string;
  kind: SemanticReferenceKind;
  rawExpression: string;             // Exact user snippet: "that project budget task"
  semanticDescriptor?: string;       // Clean semantic concept extracted by Aven: "project budget"
  entityType: "task" | "goal" | "meal" | "workout" | "schedule_block" | "activity" | "weight" | "context_mode";
  domain: "productivity" | "health" | "wellness" | "context";
  temporalConstraint?: {
    dateAnchor?: string;             // e.g. "2026-09-22"
    relativeSlot?: "morning" | "afternoon" | "evening";
  };
  contextualRelation?: "ACTIVE_FOCUS" | "PENDING_OPERATION" | "RECENT_OPERATION" | "GENERAL_SEARCH";
  resolutionStrategy: "EXPLICIT_ID" | "EXACT_TITLE" | "CONTEXTUAL_RECENT" | "AMBIGUOUS_CANDIDATES" | "UNRESOLVED";
  candidateIds?: string[];
  resolvedEntityId?: string;
  evidence?: EntityResolutionEvidence;
}
```

### Interpretation Invariant:
When user says *"done with the that project budget task"*, Aven produces:
```json
{
  "kind": "DESCRIPTIVE",
  "rawExpression": "that project budget task",
  "semanticDescriptor": "project budget",
  "entityType": "task",
  "domain": "productivity",
  "contextualRelation": "ACTIVE_FOCUS"
}
```
The resolver receives `semanticDescriptor: "project budget"`. It performs **zero English cleaning**. It matches `"project budget"` directly against candidate task titles or validates if `activeFocus.displayName` satisfies the descriptor.

---

## 5. Context Projection Behavior

There is **one and only one** canonical context projection. The `CONVERSATIONAL_LLM` branch in `Supervisor.ts` must receive the identical authoritative bounded context as `SemanticIntentInterpreter`:

```typescript
export function formatBoundedContextForPrompt(ctx: BoundedContextProjection): string {
  const parts: string[] = [];

  // 1. Active Focus Entity
  if (ctx.activeFocus) {
    parts.push(`ACTIVE FOCUS ENTITY: ${ctx.activeFocus.entityType.toUpperCase()} "${ctx.activeFocus.displayName}" (ID: ${ctx.activeFocus.entityId}, Status: ${ctx.activeFocus.status || "active"})`);
  } else {
    parts.push("ACTIVE FOCUS ENTITY: None");
  }

  // 2. Pending Operation Awaiting User Action
  if (ctx.pendingOperation) {
    parts.push(`PENDING OPERATION: ${ctx.pendingOperation.actionType} (Question asked: "${ctx.pendingOperation.clarificationQuestion}", Missing: ${ctx.pendingOperation.missingRequirement})`);
  }

  // 3. Recent Entities in Conversation (Max 4)
  if (ctx.recentEntities && ctx.recentEntities.length > 0) {
    const list = ctx.recentEntities.slice(0, 4).map(e => `${e.entityType}: "${e.displayName}"`).join(", ");
    parts.push(`RECENT CONVERSATIONAL ENTITIES: ${list}`);
  }

  // 4. Active Life Context Mode & Incidents
  if (ctx.activeMode && ctx.activeMode !== "standard") {
    parts.push(`ACTIVE LIFE MODE: ${ctx.activeMode}`);
  }

  return parts.join("\n");
}
```

When the user asks *"what goal ?"* or *"wdym?"*, `Supervisor.ts` injects `formatBoundedContextForPrompt(ctx)` into the `CONVERSATIONAL_LLM` system prompt. The model knows that the active focus is Goal *"Read 15 pages of non-fiction"* and speaks specifically to that goal instead of reciting an introductory greeting.

---

## 6. Pending Operation & State-Driven Confirmation Lifecycle

Confirmation is strictly **state-driven** through `PendingOperationContext`, with zero phrase-matching:

```
[Turn 1: Proposal]
User: "I want to start reading 15 pages of non-fiction every morning. Can we set that up as a daily habit?"
  │
  ▼ Aven classifies ACTION_REQUEST -> actionType: "propose_goal"
  │ Kernel creates Goal with status: "proposed"
  │ Supervisor sets pendingOperation:
  │   actionType: "confirm_goal"
  │   targetEntity: { entityId: goalId, displayName: "Read 15 pages of non-fiction" }
  │   missingRequirement: { kind: "USER_CONFIRMATION" }
  │   state: "AWAITING_CONFIRMATION"
  │ Response: "I've proposed that goal: 'Read 15 pages of non-fiction'. Would you like me to activate this habit?"
  │
[Turn 2: Confirmation]
User: "yes sure do that" (or "yes", "let's do it", "go ahead")
  │
  ▼ Aven evaluates Turn against BoundedContextProjection:
  │   Pending operation exists: confirm_goal for Goal "Read 15 pages of non-fiction"
  │   User utterance expresses affirmation of the active proposal
  │   Classification: CLARIFICATION_RESPONSE / CONFIRMATION
  │   Operation dispatched: confirm_goal, targetEntityId: goalId
  │
  ▼ Supervisor & Kernel:
  │   ConfirmGoalAdapter transitions Goal status from "proposed" to "active"
  │   pendingOperation cleared (null)
  │   activeFocus updated to confirmed active Goal
  │ Response: "Confirmed and activated your goal: 'Read 15 pages of non-fiction'."
  │ ZERO tasks created. ZERO duplicate goals created.
```

If the user instead says *"no, don't create that"*, the pending operation transitions to `"CANCELLED"`, the proposed goal is compensated/deleted, and zero active documents remain.

---

## 7. Goal vs. Habit vs. Recurring Task Semantics in LifeOS

Forensic analysis of `apps/web/features/goals/`, `DailyLog.ts`, and `LifeSignal.ts` confirms the canonical domain modeling:

| Domain Construct | LifeOS Representation | MongoDB Storage | Cadence / Trigger | Example |
|:---|:---|:---|:---|:---|
| **Goal** | High-level objective or identity anchor | `Goal.ts` (`type: "performance" \| "identity"`) | Long-term era / milestone | *"Run a marathon"*, *"Build LifeOS"* |
| **Habit** | **Canonical representation: `Goal` with `cadence: "daily"` & associated `LifeSignal`** | `Goal.ts` (`cadence: "daily"`, `type: "maintenance"`) + `LifeSignal.ts` (`categoryKey: "habits"`) | Tracked daily via `DailyLog.habits` and Checkin | *"Read 15 pages of non-fiction every morning"*, *"Daily coding"* |
| **Recurring Task** | Single discrete action that repeats on schedule | `Task.ts` (`isRecurring: true`, `recurrenceRule`) | Instantiates concrete scheduled instances | *"Submit weekly timesheet every Friday at 4pm"* |
| **Routine** | Structured workout or morning sequence | `GymRoutine.ts` / `ScheduleBlock.ts` | Sequential execution steps | *"Push Day routine"*, *"Morning meditation routine"* |
| **Scheduled Task** | Point-in-time single commitment | `Task.ts` (`dueDate: "YYYY-MM-DD"`, `dueTime: "HH:mm"`) | Calendar slot | *"Send updated project budget to Michael tomorrow at 3pm"* |

### Semantic Rule:
When user specifies *"set that up as a daily habit"* or *"start doing X every morning/day"*, this is **unambiguously a Goal with `cadence: "daily"`**. It must **never** be converted into an ad-hoc single-day `Task`.

---

## 8. Goal Duplicate & Idempotency Governance

### Schema Enhancement (`apps/web/features/goals/models/Goal.ts`):
```typescript
const GoalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.Mixed, ref: "User", index: true },
    title: { type: String, required: true, trim: true },
    description: String,
    status: {
      type: String,
      enum: ["active", "proposed", "archived", "completed"],
      default: "active",
      index: true,
    },
    confirmedAt: Date,
    type: {
      type: String,
      enum: ["identity", "performance", "maintenance"],
      default: "performance",
    },
    cadence: {
      type: String,
      enum: ["daily", "weekly", "flexible"],
      default: "daily",
    },
    signals: [SignalSchema],
    rules: {
      minActiveDaysPerWeek: { type: Number, default: 3 },
      graceDaysPerWeek: { type: Number, default: 2 },
    },
  },
  { timestamps: true }
);

// Pre-save normalization: guarantee string userId and trimmed title
GoalSchema.pre("save", function (next) {
  if (this.userId) {
    this.userId = this.userId.toString();
  }
  if (this.title) {
    this.title = this.title.trim();
  }
  next();
});
```

### Precondition Validation in `CreateGoalAdapter`:
1. Normalize `userId` to string.
2. Search for existing goals matching `title` (case-insensitive regex on trimmed title) where `userId` matches and `status` is in `["active", "proposed"]`.
3. If an existing goal is found, deterministically reject with:
   `DUPLICATE_DETECTED: An active goal "${existing.title}" already exists.`
4. Kernel blocks duplicate document creation with zero side effects.

---

## 9. Existing Duplicate Data Remediation Strategy

Live database inspection revealed that the user's test interaction produced **two active goals** named `"Read 15 pages of non-fiction"` in MongoDB Atlas:
- `id: 6ab19fccc3054973d3bdcb78` (Created at 21:21:16Z)
- `id: 6ab19ffac3054973d3bdcb9e` (Created at 21:22:02Z)

### Automated Remediation Migration (`scripts/remediateDuplicateGoals.ts`):
1. **Detection**:
   Scan all documents in `goals` collection. Group by `userId.toString()` and normalized title (`title.trim().toLowerCase()`).
2. **Consolidation**:
   For any cluster with count > 1:
   - Identify the canonical document (the earliest created document).
   - Set canonical document `status = "active"`.
   - Update all subsequent duplicates: set `status = "archived"` and append `[archived_duplicate]` to title or delete if unreferenced.
3. **Backfill**:
   For all existing historical goals where `status === undefined`, backfill `status = "active"`.
4. **Verification**:
   Assert that `db.goals.aggregate([ { $match: { status: { $in: ["active", "proposed"] } } }, { $group: { _id: { userId: "$userId", title: { $toLower: "$title" } }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } } ])` returns `0` results.

---

## 10. Database-Level Concurrency Analysis

Can we rely solely on a MongoDB unique index for Goal duplicate protection?

### Analysis:
- **BSON Type Variance**: In the current database, `userId` was stored as `ObjectId` on older records and as `string` on newer records. A MongoDB unique index treats `'697262fb0c80b5f356034a42'` and `ObjectId('697262fb0c80b5f356034a42')` as different keys!
- **Collation Complexity**: Case-insensitive unique indexing requires a collation `{ locale: "en", strength: 2 }`. Queries that do not explicitly supply this collation cannot use the index effectively.
- **Partial Indexing**: Partial unique index on `{ userId: 1, title: 1 }` with `{ partialFilterExpression: { status: "active" } }` is valid in MongoDB **only after** data remediation has resolved all existing duplicates and all `userId` fields are normalized to strings.

### Concurrency Protection Architecture:
1. **Migration First**: Run `remediateDuplicateGoals.ts` to clean existing duplicates and normalize `userId` to string.
2. **Partial Unique Index**: Add compound index `{ userId: 1, title: 1 }` with `{ unique: true, partialFilterExpression: { status: "active" } }`.
3. **Atomic Kernel Handling**: In `handleCreateGoal.ts`, wrap creation in a try-catch for MongoDB error code `11000` (duplicate key error). If E11000 occurs under concurrent race conditions, catch and re-throw typed `DUPLICATE_DETECTED` error so the kernel handles it gracefully without a crash.

---

## 11. Grounded Response Contract

We establish **one canonical execution result contract** rather than nested ad-hoc properties:

```typescript
export interface ICanonicalExecutionEntity {
  entityId: string;
  displayName: string;
  entityType: "task" | "goal" | "meal" | "workout" | "schedule_block" | "activity" | "weight" | "context_mode";
  domain: "productivity" | "health" | "wellness" | "context";
  metadata?: Record<string, any>;
}

export interface KernelExecutionResult<TData = any> {
  actionId: string;
  operationId?: string;
  idempotencyKey: string;
  actionType: DomainActionType;
  status: ActionExecutionStatus;
  success: boolean;
  idempotent?: boolean;
  targetEntity?: ICanonicalExecutionEntity; // Canonical location for entity identity & display
  data?: TData;
  error?: string;
  timestamp: number;
}
```

### Handler & Generator Alignment:
- In `handleCreateGoal.ts`:
  ```typescript
  return {
    type: "create_goal",
    success: true,
    targetEntity: {
      entityId: goal._id.toString(),
      displayName: goal.title,
      entityType: "goal",
      domain: "productivity",
    },
    data: { goalId: goal._id.toString(), title: goal.title, goal },
  };
  ```
- In `GroundedResponseGenerator.ts`:
  ```typescript
  case "create_goal":
  case "propose_goal": {
    const title = result.targetEntity?.displayName || result.data?.title || "goal";
    return `I've proposed that goal: "${title}".`;
  }
  case "confirm_goal": {
    const title = result.targetEntity?.displayName || result.data?.title || "goal";
    return `Confirmed and activated your goal: "${title}".`;
  }
  ```
Zero nested fallbacks. Zero `"goal"` string leakage.

---

## 12. Cross-Domain Re-Audit

Auditing all 11 mutable domain families to prevent regression:

| Domain | ActionType | Reference Kind Supported | Resolution Precedence | Duplicate Policy | Grounded Contract | STM Sync |
|:---|:---|:---|:---|:---|:---|:---:|
| **Task** | `create_task` | None (Described) | Schema validation | `CONFLICT_REQUIRES_CLARIFICATION` (same day) | `targetEntity.displayName` | Sets `activeFocus` |
| **Task** | `complete_task` | `DESCRIPTIVE`, `CONTEXTUAL_ANAPHORIC`, `EXPLICIT` | `activeFocus` → DB candidate query | `IDEMPOTENT_IGNORE` | `targetEntity.displayName` | Updates status |
| **Task** | `adjust_task_priority` | `DESCRIPTIVE`, `CONTEXTUAL_ANAPHORIC`, `EXPLICIT` | `activeFocus` → DB candidate query | `TRANSACTION_KEY` | `targetEntity.displayName` | Updates priority |
| **Task** | `delete_task` | `DESCRIPTIVE`, `CONTEXTUAL_ANAPHORIC`, `EXPLICIT` | `activeFocus` → DB candidate query | `IDEMPOTENT_IGNORE` | `targetEntity.displayName` | Clears focus |
| **Goal** | `propose_goal` | None (Described) | Schema validation | `DUPLICATE_DETECTED` | `targetEntity.displayName` | Sets `pendingOperation` |
| **Goal** | `confirm_goal` | `CONTEXTUAL_ANAPHORIC` (via pendingOp) | Pending candidate | `IDEMPOTENT_IGNORE` | `targetEntity.displayName` | Sets `activeFocus` |
| **Goal** | `create_goal` | None (Described) | Schema validation | `DUPLICATE_DETECTED` | `targetEntity.displayName` | Sets `activeFocus` |
| **Goal** | `delete_goal` | `DESCRIPTIVE`, `CONTEXTUAL_ANAPHORIC`, `EXPLICIT` | `activeFocus` → DB query | `IDEMPOTENT_IGNORE` | `targetEntity.displayName` | Clears focus |
| **Meal** | `log_meal` | None (Described) | NutritionEstimator | `APPEND_TO_EXISTING` | `targetEntity.displayName` | Sets `activeFocus` |
| **Workout** | `log_workout` | None (Described) | Schema validation | `APPEND_TO_EXISTING` | `targetEntity.displayName` | Sets `activeFocus` |
| **Weight** | `update_weight` | None (Described) | Schema validation | `UPDATE_EXISTING` | `targetEntity.displayName` | Sets `activeFocus` |

---

## 13. Replay Implications

- `ActionAuditRecordModel` persists `targetEntity: ICanonicalExecutionEntity`.
- Historical replay re-executes with the exact persisted `targetEntity.entityId`.
- Zero LLM re-invocations during replay.
- Idempotency verified via `idempotent: true` cache hits.

---

## 14. Web and Voice Parity

Both Web Chat and Realtime Voice interfaces consume:
`POST /api/conversations/[id]/messages`
- Streaming chunk generator preserves exact parity with final response text.
- Spoken responses strip markdown and maintain clean sentence boundaries for TTS cadence.

---

## 15. Automated Verification Matrix

| Test ID | Test Scenario | Input Utterances | Expected State-Based Oracle |
|:---|:---|:---|:---|
| **TC-G01** | Descriptive Task Completion without Full Title | 1. "Remind me to send updated project budget to Michael tomorrow at 3pm"<br>2. "done with the that project budget task" | Task status in MongoDB transitions to `"completed"`. Aven responds: *"Marked 'Send updated project budget to Michael' as complete."* Zero clarification questions asked. |
| **TC-G02** | Anaphoric Coreference Resolution | 1. Create task "Quarterly Tax Prep"<br>2. "mark that task done" | Resolves directly to `activeFocus`. Task completed in MongoDB. Zero ambiguity prompts. |
| **TC-G03** | Material Ambiguity Safety | Two active tasks: "Q1 Project Budget" and "Q2 Project Budget"; user says "done with the budget task" | Resolver returns `status: "AMBIGUOUS"`. Aven lists both candidates. Zero database mutations. |
| **TC-G04** | Goal Proposal Naming Parity | "I want to start reading 15 pages of non-fiction every morning. Can we set that up as a daily habit?" | Goal created with `status: "proposed"`. Grounded response emits: *"I've proposed that goal: 'Read 15 pages of non-fiction'."* Zero `"goal"` placeholders. |
| **TC-G05** | State-Driven Goal Confirmation | Turn 1: Propose goal (from TC-G04)<br>Turn 2: "yes sure do that" | Goal status in MongoDB transitions from `"proposed"` to `"active"`. Zero tasks created in MongoDB. Zero duplicate goals created. |
| **TC-G06** | Conversational Context Awareness | Turn 1: Propose goal (from TC-G04)<br>Turn 2: "what goal ?" | Conversational response specifically references *"Read 15 pages of non-fiction"*. Zero generic Aven introductory greetings. |
| **TC-G07** | Existing Duplicate Goal Governance | 1. Goal "Read 15 pages of non-fiction" is active.<br>2. User requests "set up a habit to read 15 pages of non-fiction" | Request rejected with `DUPLICATE_DETECTED`. MongoDB goal count for user remains exactly 1. |
| **TC-G08** | Concurrent Duplicate Protection | Fire two concurrent `create_goal` requests with identical titles | Exactly 1 goal succeeds; second emits `DUPLICATE_DETECTED` (via pre-validation or E11000 index constraint). MongoDB count is 1. |
| **TC-G09** | Correction Without Orphaned Mutations | 1. "Remind me to read 15 pages tomorrow" (creates task)<br>2. "Actually, make that a goal instead" | Task is deleted/compensated in MongoDB; Goal is created. Zero orphaned tasks remain. |
| **TC-G10** | Cross-Domain Ambiguity | Entities named "Gym" exist in Task and Goal; user says "update gym" | Clarification returned distinguishing Task from Goal. Zero mutations executed. |
| **TC-G11** | Crash Resilience on Pending Confirmation | Turn 1: Propose goal -> server restart simulated -> Turn 2: "confirm that" | `pendingOperation` reloaded from MongoDB STM; confirmation successfully activates the goal. |
| **TC-G12** | Replay Determinism | Replay historical audit ledger of goal proposal and confirmation | Replays 100% deterministically with zero LLM invocations and identical final state. |

---

## 16. Real MongoDB State-Based Test Oracles

Every test in `conversationalDisambiguationAndGoals.test.ts` validates live MongoDB documents:
- `Task.findOne({ _id: taskId })` -> assert `status === "completed"`.
- `Goal.find({ userId, title: "Read 15 pages of non-fiction" })` -> assert `length === 1` and `status === "active"`.
- `Task.countDocuments({ userId, title: /reading/i })` -> assert `0` tasks created when a habit/goal is confirmed.
- `ConversationShortTermMemory.findOne({ conversationId })` -> assert `activeFocus.entityType === "goal"` and `pendingOperation === null`.

---

## 17. Failure-Injection Cases

- **DB Disconnect during Confirmation**: Throws typed `[KERNEL_DATABASE_DISCONNECTED]`; does not falsely claim the goal was activated.
- **Concurrent Insertion Race**: Second request caught by partial unique index throws `DUPLICATE_DETECTED` cleanly.
- **Corrupted STM**: Fallback to candidate database search without unhandled exception.

---

## 18. Regression Requirements against Continuity Suite

All 14 tests in `packages/execution-kernel/src/testing/conversationalContinuity.test.ts` (TC-01 through TC-14), `phase4SupervisorSemantic.test.ts`, `phase6EntityResolution.test.ts`, and `phase7TruthfulGrounding.test.ts` must pass 100% with 0 failures before sign-off.

---

## 19. Explicit List of Files to Modify

```
packages/execution-kernel/
  src/orchestration/
    contracts/
      SemanticTurnContracts.ts        [MODIFY: EntityReference with kind & semanticDescriptor]
      ActionProposalContracts.ts      [MODIFY: KernelExecutionResult with canonical targetEntity]
    context/
      AuthoritativeEntityResolver.ts  [MODIFY: Resolve structured semanticDescriptor; zero natural language parsing]
    supervisor/
      Supervisor.ts                   [MODIFY: Inject bounded context projection into CONVERSATIONAL_LLM]
    semantic/
      SemanticIntentInterpreter.ts    [MODIFY: Extract semanticDescriptor; state-driven goal confirmation]
    kernel/
      DefaultActionAdapters.ts        [MODIFY: CreateGoalAdapter duplicate check on status !== "archived"]
    grounding/
      GroundedResponseGenerator.ts    [MODIFY: Consume canonical targetEntity; clean DUPLICATE_DETECTED format]
  src/dispatch/executionHandlers/
    handleCreateGoal.ts               [MODIFY: Return canonical targetEntity, goalId, and title at root]
apps/web/
  features/goals/models/
    Goal.ts                           [MODIFY: Add status & confirmedAt to GoalSchema, pre-save normalization]
scripts/
  remediateDuplicateGoals.ts          [NEW: Script to consolidate existing active duplicate goals in MongoDB Atlas]
packages/execution-kernel/src/testing/
  conversationalDisambiguationAndGoals.test.ts [NEW: Full 12-test suite for TC-G01 through TC-G12]
```

---

## 20. Architecture Invariants

- **Invariant S-1 (Clear Ownership)**: Aven interprets language; Context Resolver binds references; Supervisor orchestrates; Adapters mutate; Generator speaks.
- **Invariant S-2 (No Brittle Routing)**: Zero regex semantic routing; zero phrase-trigger branches; zero keyword entity scoring.
- **Invariant S-3 (Replay Determinism)**: 100% deterministic replay from audit records without LLM re-invocation.
- **Invariant S-4 (Material Ambiguity Safety)**: Zero silent recency selection when multiple candidates match a semantic descriptor.
- **Invariant S-5 (Canonical Contracts)**: Exactly one `ICanonicalExecutionEntity` contract consumed by grounding and STM.
- **Invariant S-6 (Continuation Over Mutation)**: Confirmations resume pending operations; they never spawn new tasks or duplicate documents.
- **Invariant K-1 (Deterministic Kernel)**: Kernel validates preconditions deterministically; zero NLP inside adapters.

---

## 21. Non-Goals and Forbidden Patterns

- **NO Lexical/Token-Overlap Entity Routing**: No `cleanEntityExpression` with phrase-stripping in the resolver. No `matchingTokens / queryTokens >= 80%` heuristics in the resolver.
- **NO Regex Intent Matching**: No checking `if (input === "yes sure do that")`.
- **NO Arbitrary Habit -> Task Conversion**: Habits are canonically Goals with `cadence: "daily"`.
- **NO Fake Success**: Adapters never return mock IDs in production.
- **NO Multiple Context Models**: Conversational branch and semantic branch share the identical `BoundedContextProjection`.
- **NO Modifying Production Code During Planning**: Strict review and approval required before execution.
