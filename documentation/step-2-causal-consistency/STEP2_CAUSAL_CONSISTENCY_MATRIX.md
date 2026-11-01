# LIFEOS STEP 2 — CAUSAL CONSISTENCY MATRIX
## Causal Ordering Guarantees, Version Relationships & Monotonicity Formalisms
**Document Version:** 2.2.0  
**Phase:** Step 2 Architecture & Planning Review  
**Governing Specification:** LifeOS V2.3.0 Final Architectural Specification (*Frozen*)  
**Core Architectural Axiom:** *"The kernel provides truth. Agents provide intelligence."*  
**Classification:** Authoritative Technical Specification  

---

## Document Changelog

### V2.1.0 $\to$ V2.2.0
| Change Item | Architectural Risk Resolved | Affected Loop | Technical Justification & Source Evidence |
| :--- | :--- | :---: | :--- |
| **Authoritative Task Reconciliation Formalism** | R-03, R-09: Incremental Math Drift | Loop 1 | Removed all remaining incremental arithmetic formulas ($+1 / -1$) from Model 1. Replaced with Authoritative Snapshot Reconciliation formulas. Strictly decoupled task counts from habitual cadence streaks. |
| **Seed-or-Acquire Partition Lease CAS Formalism** | R-05: E11000 Duplicate Key Crashes | Loop 4 | Replaced conditional-upsert equation in Section 6 with the Seed-or-Acquire protocol: atomic CAS on existing record (no upsert); if not found, atomic create catching E11000. Clock-based expiry comparison (`leaseExpiresAt < now`), completely independent of async MongoDB TTL. Canonical key: `${userId}:${aggregateType}:${aggregateId}`. |
| **Deterministic SHA-256 Manifest Hash Formalism** | R-10: Sum Collision on Temporal Rescheduling | Loop 3 | Replaced scalar sum fingerprint in Model 3 with deterministic SHA-256 partition manifest hash $H_{\text{source}} = \text{SHA256}(\mathcal{M}_{\text{source}})$ over sorted occurrence tuples, eliminating sum collisions on multi-event moves. Background sweeper guarantees recovery from lost/delayed events. |

### V1.0.0 $\to$ V2.0.0
| Change Item | Architectural Risk Resolved | Affected Loop | Technical Justification & Source Evidence |
| :--- | :--- | :---: | :--- |
| **Safely Superseded vs. Missing Historical Effects** | R-01: Silent Data Loss | Loops 1–3 | Established formal mathematical rules: State transitions with version $V \le V_{\text{applied}}$ are safely superseded; incremental effects (counters, completions) are never discarded and must be tracked per constituent aggregate or reconciled authoritatively. |
| **Partition Sweep Revision CAS Fencing** | R-01: Race Conditions in Day Sweeps | Loop 3 | Formally defined `sweepRevision` fencing equation on `ScheduleConflictReportModel` to prevent concurrent older sweeps from overwriting newer sweeps. |
| **Read-Your-Writes Convergence Barrier Protocol** | R-06: Stale Read Consistency | Loop 6 | Expanded `waitForConvergence` from a simple zero-outbox check into an authoritative ledger verification protocol that checks all required consumers and guards against false positives on DLQ events. |
| **Worker Lease Partitioning Protocol** | R-05: Interleaved Aggregate Leases | Loop 4 | Defined aggregate partition fencing equation ensuring events for the same aggregate root cannot be leased to competing workers simultaneously. |

---

## 1. Mathematical Formulation of LifeOS Causal Clock

In LifeOS, primary domain aggregates increment an internal integer version on every mutation:
$$V_{\text{agg}}^{(k+1)} = V_{\text{agg}}^{(k)} + 1 \quad \text{where } V_{\text{agg}}^{(0)} = 1$$

When an aggregate mutation emits an event into the transactional outbox (`outboxevents`), the kernel computes an ordinal sequence number for that event within that version transaction:
$$O_{\text{event}} \in \{1, 2, \dots, m\}$$

The scalar causal sequence number is computed in `OutboxStorageService.ts` as:
$$S(E) = \big(V_{\text{agg}} \times 1000\big) + O_{\text{event}}$$

### Mathematical Properties
1. **Local Strict Monotonicity**: For any two events $E_1, E_2$ emitted by the **same aggregate root** $A$:
   $$E_1 \prec_A E_2 \iff S(E_1) < S(E_2)$$
2. **Global Non-Comparability**: For two events $E_a, E_b$ emitted by **different aggregates** $A \ne B$:
   $$S(E_a) < S(E_b) \centernot\implies E_a \prec E_b$$
   Because aggregate versions are incremented independently based on their individual mutation histories, their scalar causal sequences exist in disjoint partial orders. Comparing $S(E_a)$ and $S(E_b)$ directly is mathematically invalid.

---

## 2. The Global Monotonicity Fallacy & Resolution Proof

### The Failure Proof
Consider a projection $P$ (e.g. `ExecutionGraphDerivedModel` for user $U$) that aggregates events from $N$ distinct tasks $\{T_1, T_2, \dots, T_N\}$.
1. Let Task $T_1$ undergo 5 edits. Its version is $V(T_1) = 5$.
2. Task $T_1$ completes. It emits $E_1 = \text{domain.task.completed}$ with:
   $$S(E_1) = (5 \times 1000) + 1 = 5001$$
3. Consumer processes $E_1$. Projection $P$ sets:
   $$P.\text{derivedFromCausalSequence} = 5001$$
4. Next, Task $T_2$ is created and immediately completed. Its version is $V(T_2) = 1$.
5. Task $T_2$ emits $E_2 = \text{domain.task.completed}$ with:
   $$S(E_2) = (1 \times 1000) + 1 = 1001$$
6. Consumer evaluates $E_2$:
   $$P.\text{derivedFromCausalSequence} \ge S(E_2) \iff 5001 \ge 1001 \equiv \text{TRUE}$$
7. **Result**: $E_2$ is discarded as stale. $T_2$ is never marked completed in $P$. The system permanently desynchronizes.

---

## 3. Formal Causal Topology Matrix

| Entity / Projection Pair | Projection Relationship | Event Processing Archetype | Is Scalar $S(E)$ Valid? | Step 2 Causal Resolution Pattern | Stale-Event Behavior |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **`Goal` $\to$ `GoalStats`** | 1 : 1 (Direct) | **State Transition** | **YES** | Scalar `derivedFromVersions.goalVersion` guard. | Safely superseded if $V_{\text{goal}} \le V_{\text{applied}}$. |
| **`Task` $\to$ `GoalStats`** | $N : 1$ (Multi-task to Goal) | **Incremental Effect** | **NO** | **Constituent Version Map**: `taskVersions[taskId]`. | Skipped if $V_{\text{task}} \le \text{taskVersions}[taskId]$. Never dropped due to goal version! |
| **`Task` $\to$ `ExecutionGraph`** | $N : 1$ (All user tasks to Graph) | **State Transition per Node** | **NO** | **Per-Node Applied Version**: `node.appliedVersion`. | Node update skipped if $V_{\text{task}} \le \text{node.appliedVersion}$. |
| **`TemporalOccurrence` $\to$ `ScheduleConflictReport`** | $N : 1$ (All day occurrences to Report) | **Invalidation Trigger** | **NO** | **Authoritative Day Sweep + CAS on `sweepRevision`**. | Older sweep discarded if CAS matches 0; sweep retried. |
| **`WorkoutSession` $\to$ `DailyLog`** | $N : 1$ (All day sessions to DailyLog) | **Invalidation Trigger** | **NO** | **Authoritative Day Sweep + CAS on `DailyLog.version`**. | Handled via in-band jittered retry loop. |
| **`Occurrence/Workout` $\to$ `CadenceProfile`** | $N : 1$ (Chronicle history) | **Historical Observation** | **NO** | **Chronicle Sorting modulo-1440**. | Older events adjust distribution variance gracefully. |
| **`Task/Signal` $\to$ `BehavioralProfile`** | $N : 1$ (Continuous stream) | **Historical Observation** | **NO** | **L1 Ring Buffer + L2 Journal + CAS on `projectionRevision`**. | Duplicate returns `SKIPPED_ALREADY_APPLIED`. |
| **`Telemetry` $\to$ `CognitiveStateHistory`** | $1 : N$ (Time series append) | **Historical Observation** | **N/A** | **Idempotent Unique Key**: `(userId, timestamp)`. | Duplicate returns `SUCCEEDED` immediately. |

---

## 4. Formal Resolution Mathematical Models

### Model 1: Authoritative Snapshot Reconciliation Vector (Applied to `GoalStatsModel`)
The derived document stores a dictionary of the highest applied version for each constituent entity and the authoritative source boundary:
```typescript
interface IConstituentVersionMap {
  goalVersion: number;
  taskVersions: Record<string, number>; // taskId -> highest applied aggregateVersion
}
```
**State Transition Rules**:
$$\forall E = \langle \text{type}, A_{\text{id}}, V \rangle:$$
1. If $\text{type} \in \{\text{domain.goal.*}\}$:
   $$\text{If } V \le \text{goalVersion} \implies \text{SKIPPED\_STALE (Safely Superseded)}$$
   $$\text{Else } \text{applyGoalMutation}(E) \land \text{goalVersion} \gets V$$
2. If $\text{type} \in \{\text{domain.task.completed}, \text{domain.task.uncompleted}, \text{domain.task.deleted}\}$:
   $$\text{If } V \le \text{taskVersions}[A_{\text{id}}] \implies \text{SKIPPED\_STALE (Already Subsumed)}$$
   $$\text{Else execute Authoritative Snapshot Reconciliation:}$$
   $$\text{Mode A (Tx): } \text{tasks} = \text{Task.find}(\{ \text{goalId}, \text{status} \notin [\text{"archived"}, \text{"deleted"}] \}).\text{session}(\text{session})$$
   $$\text{Mode B (CAS): Capture } \Sigma_{\text{source}} = \langle V_{\text{goal}}, N_{\text{tasks}}, \Sigma V_{\text{tasks}}, \max T_{\text{tasks}} \rangle \land \text{Revalidate before CAS commit}$$
   $$\text{completedTasksCount} \gets |\{ t \in \text{tasks} \mid t.\text{status} == \text{"completed"} \}|$$
   $$\text{totalTasksCount} \gets |\text{tasks}|$$
   $$\text{taskVersions}[A_{\text{id}}] \gets V$$
   **Decoupling Axiom**: $\text{currentStreak}$ and $\text{bestStreakEver}$ are untouched by task events.

This guarantees mathematical convergence: each constituent entity's events are causally ordered, incremental delta drift is eliminated, and source snapshots are strictly verified!

---

### Model 2: Per-Node Applied Version (Applied to `ExecutionGraphDerivedModel`)
Each node in `ExecutionGraphDerivedModel.nodes` tracks its own `appliedVersion`:
```typescript
interface IGraphNodeSubdoc {
  id: string;                    // taskId
  title: string;
  status: "pending" | "completed" | "in_progress" | "blocked";
  dependencies: string[];
  appliedVersion: number;       // Monotonic per taskId
}
```
**State Transition Rules**:
For incoming event $E$ for task $T_{\text{id}}$ with version $V$:
- Look up node $n \in \text{nodes}$ where $n.\text{id} == T_{\text{id}}$.
- If $n$ exists and $n.\text{appliedVersion} \ge V$:
  $$\text{Return } \text{SKIPPED\_STALE (Node edit superseded)}$$
- Otherwise:
  - Mutate $n.\text{status} = E.\text{status}$, $n.\text{title} = E.\text{title}$, $n.\text{dependencies} = E.\text{dependencies}$.
  - Set $n.\text{appliedVersion} \gets V$.
  - Recompute unblocked dependent tasks:
    $$\mathcal{U} = \{m \in \text{nodes} \mid m.\text{status} == \text{"pending"} \land m.\text{dependencies} \subseteq \text{completedNodes}\}$$
  - Commit atomically:
    $$\text{updateOne}(\{\text{graphId}, \text{projectionRevision}: R\}, \{\$set: \{\dots\}, \$inc: \{\text{projectionRevision}: 1\}\})$$

---

### Model 3: Deterministic Partition Manifest Sweep with CAS Fencing (Applied to `ScheduleConflictReportModel`)
For projections where derived state is a pure function of all active entities on a date:
1. Consumer reads current report: obtains `sweepRevision = R`.
2. Queries authoritative primary collection for day occurrences:
   $$\mathcal{O}_{\text{all}} = \text{TemporalOccurrence.find}(\{ \text{userId}, \text{dateOnly} \})$$
3. Constructs sorted manifest $\mathcal{M}_{\text{source}} = [(o.\text{id}, o.\text{version}, o.\text{status}, o.\text{startMinute}, o.\text{endMinute})]$ and computes SHA-256 partition hash $H_{\text{source}}$.
4. Sweeps active occurrences $\mathcal{O}_{\text{active}}$ sorted chronologically; computes pairwise conflict set $\mathcal{C}$ and proposal set $\mathcal{P}$.
5. Enforces human governance: $\forall p \in \mathcal{P}, p.\text{humanGovernanceStatus} \gets \text{"PENDING\_CONFIRMATION"}$.
6. Pre-commit check: Re-verifies $H_{\text{source}}^{\text{current}} == H_{\text{source}}$. If partition mutated mid-sweep, aborts and retries.
7. Commits via atomic CAS:
   $$\text{filter} = \{ \text{reportId}, \text{sweepRevision}: R \}$$
   $$\text{update} = \{ \$set: \{ \text{sourcePartitionHash}: H_{\text{source}}, \text{conflicts}: \mathcal{C}, \text{repairPlan}: \mathcal{P}, \text{lastEvaluatedAt}: \text{now}() \}, \$inc: \{ \text{sweepRevision}: 1 \} \}$$
8. If `matchedCount === 0`: A concurrent sweep completed first. Re-read $R'$ and retry.
   $$\text{update} = \{ \$set: \{ \text{conflicts}: \mathcal{C}, \text{repairPlan}: \mathcal{P}, \text{lastEvaluatedAt}: \text{now}() \}, \$inc: \{ \text{sweepRevision}: 1 \} \}$$
6. If `matchedCount === 0`: A concurrent sweep completed first. Re-read $R'$ and retry.

---

## 5. End-to-End Read-Your-Writes Convergence Barrier

The convergence barrier in `WorldModelBridge` must guarantee that a caller reads a state reflecting its previous mutations:

```typescript
public async waitForConvergence(
  userId: string,
  targetCorrelationId: string,
  timeoutMs: number = 2000
): Promise<{
  status: "FULLY_CONVERGED" | "PARTIALLY_CONVERGED" | "ACTIVE_PROPAGATION" | "DEGRADED" | "PERSISTENCE_UNAVAILABLE" | "TIMED_OUT";
  inFlightCount: number;
  completedConsumers: string[];
  failedConsumers: string[];
  deadLetterCount: number;
}>
```

### Deterministic Barrier Verification Protocol:
```
           Incoming waitForConvergence(userId, correlationId)
                                  │
         Is persistence available? (MongoDB connected?)
                                  ├── No ──► "PERSISTENCE_UNAVAILABLE"
                                 Yes
                                  ▼
      Query OutboxEventModel for (userId, correlationId)
                                  │
       Any event in PENDING_COMMIT, PENDING, PROCESSING?
                                  ├── Yes ──► Loop & Poll until timeout
                                  No
                                  ▼
             Any event in DEAD_LETTER or FAILED?
                                  ├── Yes ──► "DEGRADED"
                                  No
                                  ▼
     For all DELIVERED events: resolve required consumers
      Check ConsumerProcessingLedgerModel for each event
                                  │
        Are ALL required consumers SUCCEEDED or SKIPPED?
                                  ├── No ──► "PARTIALLY_CONVERGED" / "DEGRADED"
                                 Yes
                                  ▼
             Cache re-hydrated from projection models
                                  │
                       "FULLY_CONVERGED"
```

**CRITICAL INVARIANT**: If any required consumer has failed, timed out, or reached `DEAD_LETTER`, the system **never** reports `FULLY_CONVERGED`.

---

## 6. Worker Lease Partitioning & Monotonic Generation Fencing

To prevent concurrent race conditions across distributed workers:
1. **The Seed-or-Acquire Atomic Partition Lease Protocol**:
   Canonical partition key: `partitionKey = "${userId}:${aggregateType}:${aggregateId}"`.
   - **Step 1: Attempt Atomic CAS Acquisition (NO UPSERT)**:
     $$\text{findOneAndUpdate}(\{ \text{partitionKey}, \$or: [\{ \text{status}: \text{"RELEASED"} \}, \{ \text{leaseExpiresAt}: \{ \$lt: \text{now}() \} \}] \}, \{ \$set: \{ \text{leasedByWorkerId}: \text{workerId}, \text{status}: \text{"ACTIVE"}, \text{leaseExpiresAt}: \text{now}() + \text{ttl} \}, \$inc: \{ \text{leaseGeneration}: 1 \} \})$$
     *(Lease expiry evaluated via explicit clock comparison; NEVER relies on async MongoDB TTL background deletion).*
     If acquired, return success with incremented `leaseGeneration`.
   - **Step 2: Check Existing Document**:
     If `acquired === null`, check `partitionLeaseModel.exists({ partitionKey })`. If true, an active unexpired lease is held by another worker; return `{ acquired: false }` cleanly without throwing.
   - **Step 3: Atomic Initial Seed**:
     If document does not exist, execute `partitionLeaseModel.create(...)`. If a competing worker seeds simultaneously, catch `err.code === 11000` (E11000 duplicate key) and return `{ acquired: false }`. Zero unhandled exceptions!
2. **Monotonic Event Dispatching**:
   Once Worker A holds the partition lease, it acquires all ready events for that partition in strict causal sequence order:
   $$\text{find}(\{ \text{userId}, \text{aggregateType}, \text{aggregateId}, \text{deliveryStatus}: \text{"PENDING"} \}).\text{sort}(\{ \text{causalSequence}: 1 \}).\text{limit}(\text{batchSize})$$
3. When Worker A finishes processing, it acknowledges events via CAS and releases the partition lease:
   $$\text{updateOne}(\{ \text{partitionKey}, \text{leasedByWorkerId}: \text{workerA}, \text{leaseGeneration}: G, \text{status}: \text{"ACTIVE"} \}, \{ \$set: \{ \text{status}: \text{"RELEASED"}, \text{leasedByWorkerId}: \text{null}, \text{leaseExpiresAt}: \text{null} \} \})$$
4. If Worker A stalls and its lease expires, Worker B acquires the partition lease with incremented `leaseGeneration` ($G+1$). Worker A's subsequent acknowledgments match 0 documents $\implies$ Worker A detects fence-out and logs `fencedCount++`. Split-brain is prevented!
