# LIFEOS STEP 2 — TESTING STRATEGY
## Multi-Layer Verification, Concurrency Contention & Deterministic Replay
**Document Version:** 2.2.0  
**Phase:** Step 2 Architecture & Planning Review  
**Governing Specification:** LifeOS V2.3.0 Final Architectural Specification (*Frozen*)  
**Core Architectural Axiom:** *"The kernel provides truth. Agents provide intelligence."*  
**Classification:** Authoritative Technical Strategy  

---

## Document Changelog

### V2.1.0 $\to$ V2.2.0
| Change Item | Architectural Risk Resolved | Affected Loop | Technical Justification & Source Evidence |
| :--- | :--- | :---: | :--- |
| **Authoritative Source State Fingerprint Testing** | R-02, R-08: Stale Graph Reads & Skew | Loop 2 | Layer 3 & 5 tests verify Authoritative Source State Fingerprinting (`sourceTaskCount`, `sourceVersionSum`, `sourceMaxVersion`) via indexed aggregation, asserting explicit degradation metadata when freshness cannot be proven. |
| **Dual-Mode GoalStats Snapshot Tests** | R-03, R-09: Un-isolated Snapshot Drift | Loop 1 | Layer 2 & 5 tests verify Dual-Mode Reconciliation (Mode A snapshot transactions; Mode B 5-step source fingerprint revalidation and projection revision CAS with bounded retry), asserting strict decoupling from cadence streaks. |
| **Seed-or-Acquire Partition Lease Contention Tests** | R-05: E11000 Duplicate Key Crashes | Loop 4 | Layer 5 tests verify the Seed-or-Acquire protocol under 5 concurrent workers, asserting zero E11000 duplicate key crashes and strict serial processing per aggregate. Clock-based expiry verified. |
| **Dead-Letter Replay Ledger Reset Tests** | R-07: Stuck Failed Consumers | Loop 4 | Layer 6 tests assert that dead-letter replay resets failed consumers in `ConsumerProcessingLedgerModel` to `PENDING_RETRY` while preserving `SUCCEEDED` status for sibling consumers. |
| **Rebuild Retry Exhaustion Tests** | R-02, R-03, R-10: Contested Snapshot Overwrite | Loop 7 | Layer 7 tests assert that upon 3 CAS retry collisions, the system preserves last known valid database state, refuses to overwrite with stale calculations, and returns an explicit reconciliation failure. Incomplete history flags verified. |
| **Target Metric & SLA Formalization** | Documentation Consistency | All Loops | Formally designated 131 new Step 2 tests and 222 regression tests as Target Acceptance Figures to be established by execution evidence. Performance SLAs designated as Provisional Operational Targets. |

### V2.0.0 $\to$ V2.1.0
| Change Item | Architectural Risk Resolved | Affected Loop | Technical Justification & Source Evidence |
| :--- | :--- | :---: | :--- |
| **Reconciled Test Runner & Commands** | Tooling Consistency Defect | All Loops | Reconciled all test commands from legacy Vitest references to canonical monorepo runner: `npx tsx --tsconfig packages/execution-kernel/tsconfig.json --test packages/execution-kernel/src/testing/step2/*.test.ts`. |
| **Exact Test Count Alignment** | Specification Ambiguity | All Loops | Reconciled total test count across all documentation: **Exactly 131 New Step 2 Tests + 222 Regression Tests = 353 Total Tests**. |
| **Minimal Safe Dead-Letter Replay Specs** | R-07: Replay State Machine Bloat | Loop 4 | Removed synthetic replay generations. Layer 6 tests now verify that replaying a dead-lettered event resets the existing outbox document and skips already-succeeded sibling consumers via `ConsumerProcessingLedgerModel`. |
| **Source Snapshot & Freshness Tests** | R-02, R-08, R-10: Clobber & Staleness Races | Loop 2, 3 | Layer 3 & 5 tests now assert source occurrence snapshot invalidation before report commit and 2-clause freshness predicate checks (`updatedAt > lastAppliedAt`) on cached graph models. |

### V1.0.0 $\to$ V2.0.0
| Change Item | Architectural Risk Resolved | Affected Loop | Technical Justification & Source Evidence |
| :--- | :--- | :---: | :--- |
| **Independent Semantic Architecture Testing** | R-08: Semantic Coercion / Keyword Leaks | Loop 7 | Separated semantic testing into two distinct acceptance dimensions: **Structural AST Compliance** (Dimension A) and **Semantic Behavioral Generalization** (Dimension B) covering 15 held-out categories (unseen phrasing, custom signals, Hinglish, contextual references, ambiguous intent). AST compliance alone cannot prove semantic capability. |
| **Read-Your-Writes Convergence Barrier Testing** | R-06: False Positive Convergence | Loop 6 | Added explicit tests verifying that `waitForConvergence` rejects false positives on dead-lettered events and awaits all required consumer completions in `ConsumerProcessingLedgerModel`. |
| **Dead-Letter Replay & Sibling Isolation Battery** | R-07: Incomplete Replay Verification | Loop 4 | Added tests verifying that replaying a dead-lettered event does not re-execute consumers that already succeeded and correctly resets lease generation and retry attempts. |
| **DailyLog Physical Convergence Battery** | DailyLog Physical Coverage Gap | Loop 1, 7 | Added dedicated integration tests verifying workout session deletion strain recalculation ($1 - \prod(1 - S_i)$), zero-reset on all sessions deleted, and CAS contention under 10 parallel workout writes. |
| **Real MongoDB vs. Mode B Direct Writes** | Mock-Only Verification Risk | Loop 7 | Formally mandated running transaction tests against real MongoDB replica sets, with explicit fallback marking tests as `UNVERIFIED` if replica set infrastructure is unavailable. |

---

## 1. Testing Philosophy & Verification Pyramid

Step 2 remediation requires an exhaustive, multi-layered verification strategy built upon **Loop Engineering**. Because causal consistency and distributed asynchronous projections involve subtle race conditions, partial failures, and concurrency hazards, ordinary unit testing alone is insufficient.

```
                           ▲
                          / \
                         /   \     Layer 10: Semantic Behavioral Generalization (15 Categories)
                        /     \    Layer 9: Human Governance & Security Boundaries
                       /       \   Layer 8: Mode A (Transactions) vs Mode B (Direct) Parity
                      /         \  Layer 7: Replay & Deterministic Rebuild Tests
                     /           \ Layer 6: Failure Injection, DLQ & Poison Pill Tests
                    /             \Layer 5: High-Concurrency CAS Contention Tests
                   /               \Layer 4: Structural Semantic Architecture (AST Probes)
                  /                 \Layer 3: End-to-End Causal Convergence & Barrier
                 /                   \Layer 2: Canonical Consumer Unit Test Battery
                /                     \Layer 1: TypeScript Compilation (0 errors)
               -------------------------
```

---

## 2. Multi-Layer Testing Specifications

### Layer 1: Static Type & Compile Verification
- **Command**: `npx tsc --noEmit --project packages/execution-kernel/tsconfig.json`
- **Scope**: Entire monorepo (`apps/web`, `packages/execution-kernel`, `packages/design-system`).
- **Target**: Exits with code 0. Zero warnings, zero compilation errors.

### Layer 2: Canonical Consumer Unit Test Battery
- **Target**: All 7 canonical consumers tested in isolation with mock models and controlled event streams.
- **Test Scenarios per Consumer**:
  1. **`NOT_YET_APPLIED`**: Fresh event applied correctly; projection state mutated; ledger marked `SUCCEEDED`.
  2. **`ALREADY_APPLIED`**: Duplicate event ID redelivered; consumer detects existing `lastEventId` or ledger entry; returns `SUCCEEDED` with zero state mutation.
  3. **`ALREADY_SUBSUMED`**: Older event with lower version delivered out of order; consumer detects version staleness; returns `SKIPPED_STALE` with zero state mutation.
  4. **`RETRYABLE_FAILURE`**: Database CAS collision or network error thrown; consumer catches and returns `FAILED_RETRYABLE`.
  5. **Constituent Entity Isolation**: For multi-aggregate consumers (`GoalIntelligenceConsumer`, `ExecutionGraphConsumer`, `TemporalConflictConsumer`), verify that an event for Aggregate B at version 1 is **NOT** rejected when Aggregate A has advanced to version 5!

### Layer 3: End-to-End Causal Convergence & Barrier Tests
- **Target**: `DurableOutboxDispatcher` $\to$ `WorkerLeaseManager` $\to$ `ConsumerRegistry` $\to$ Projections $\to$ `WorldModelBridge`.
- **Test Scenarios**:
  1. **Full Lifecycle Execution**: Client mutation $\to$ outbox insertion $\to$ dispatcher cycle $\to$ consumer execution $\to$ projection update $\to$ WorldModel projection verification.
  2. **Read-Your-Writes Barrier**: Verify that `WorldModelBridge.waitForConvergence(userId, correlationId)`:
     - Returns `FULLY_CONVERGED` when all matching consumers succeed.
     - Returns `DEGRADED` if any event is in `DEAD_LETTER`.
     - Returns `PARTIALLY_CONVERGED` if a consumer failed with `FAILED_TERMINAL`.
     - Returns `TIMED_OUT` if processing exceeds deadline.
  3. **Multi-Consumer Fan-Out**: Verify that a single `domain.task.completed` event fans out to 5 consumers with sibling isolation.

### Layer 4: Structural Semantic Architecture Compliance (AST Probes)
- **Target**: Static AST scanner verifying strict architectural invariants.
- **Invariants Enforced**:
  1. No regex-based semantic classification or keyword matching in the execution kernel.
  2. No hardcoded English phrase dictionaries for action mapping.
  3. No prose-based action coercion or arbitrary confidence thresholds as sole execution gates.
  4. No consumer mutates primary aggregate collections (`Task`, `Goal`, `TemporalOccurrence`, `WorkoutSession`).
  5. No application route writes directly to `ExecutionGraphDerivedModel` or bypasses canonical persistence.

### Layer 5: High-Concurrency CAS Contention Tests
- **Target**: Lock-free optimistic concurrency control under heavy parallel load.
- **Test Scenarios**:
  1. **Simultaneous Task Completions**: 20 parallel workers concurrently completing tasks for the same goal and same user.
     - Verify: Zero lost updates in `GoalStatsModel.completedTasksCount`.
     - Verify: In-band CAS retry loop handles collisions cleanly.
  2. **Multi-Worker Partition Lease Contention**: 5 concurrent worker processes attempting to lease the same aggregate partition simultaneously.
     - Verify: Zero unhandled `E11000 duplicate key error` crashes under Seed-or-Acquire protocol.
     - Verify: Strictly one worker acquires lease; remaining workers gracefully skip.
     - Verify: Lease expiration evaluated via clock comparison (`leaseExpiresAt < now`), completely independent of async MongoDB TTL.
  3. **Simultaneous Workout Logging**: 10 parallel workout logging calls on the same date.
     - Verify: `DailyLog.version` increments cleanly; final strain matches authoritative formula: $1 - \prod(1 - S_i)$.
     - Verify: Deleting all sessions resets `strain` to `0.0`.
  4. **Concurrent DAG Unblocking**: Multiple tasks in an execution graph completed in parallel threads.
     - Verify: `ExecutionGraphDerivedModel` correctly resolves all unblocked downstream tasks with zero race conditions.
  5. **Concurrent Day Sweeps**: 5 parallel occurrence modifications on the same date.
     - Verify: Deterministic SHA-256 partition manifest hash $H_{\text{source}}$ detects mid-sweep edits; `sweepRevision` CAS ensures the latest sweep wins without overwriting.

### Layer 6: Failure Injection, DLQ & Poison Pill Tests
- **Target**: Worker crashes, transient DB drops, malformed events, and poison pills.
- **Test Scenarios**:
  1. **Worker Crash Mid-Processing**: Worker leases batch, executes 2 of 5 consumers, and simulates sudden process exit (lease expiration).
     - Verify: Standby worker acquires expired lease after TTL.
     - Verify: `ConsumerProcessingLedgerModel` skips already-succeeded consumers (partial acknowledgment).
     - Verify: Remaining 3 consumers execute successfully to completion.
  2. **Poison Pill Event Quarantine**: Event with invalid payload causes consumer to throw.
     - Verify: Dispatcher increments `attempts` and applies exponential backoff ($1\text{s}, 2\text{s}, 4\text{s}, \dots$).
     - Verify: After reaching `maxAttempts = 5`, event is moved to `deliveryStatus: "DEAD_LETTER"`.
     - Verify: Unaffected sibling events continue processing without queue blockage.
  3. **Dead-Letter Replay & Ledger Reset**:
     - Verify: `DeadLetterService.replayDeadLetter(eventId, userId)` resets outbox document status to `PENDING` (`attempts = 0`, original `eventId` and `payload` preserved).
     - Verify: Consumer ledger status for failed consumer is atomically reset to `PENDING_RETRY`.
     - Verify: Replay checks `ConsumerProcessingLedgerModel` to skip consumers that previously succeeded (`status: "SUCCEEDED"`) and only re-executes the failed consumer without state bloat.

### Layer 7: Replay & Deterministic Rebuild Tests
- **Target**: Authoritative projection rebuild functions and retry exhaustion semantics.
- **Test Scenarios**:
  1. **Drop and Rebuild**: Delete all records in `goalstats`, `executiongraphderiveds`, and `scheduleconflictreports`.
  2. **Authoritative Replay**: Execute `rebuildGoalStats(goalId)`, `rebuildExecutionGraph(userId)`, and `rebuildScheduleConflicts(userId, dateOnly)`.
  3. **State Equality**: Assert that rebuilt projection state matches the state produced by chronological outbox event consumption with zero variance.
  4. **Habitual Cadence Streak Integrity**: Verify that `rebuildGoalStats` recomputes 14-day streaks from `DailyLog` signals rather than resetting to 0.
  5. **Retry Exhaustion Contention Safety**: Simulate 3 consecutive CAS collisions during rebuild.
     - Verify: System preserves last known valid database state in MongoDB.
     - Verify: Contested stale snapshot is NEVER published.
     - Verify: System returns explicit reconciliation failure receipt.
     - Verify: Incomplete history flags (`cadenceHistoryIncomplete`, `insufficientObservations`) are correctly set when historical records are unavailable.

### Layer 8: Mode A (Transactions) vs. Mode B (Direct Writes) Parity
- **Target**: Dual-mode outbox storage engine (`OutboxStorageService.ts`).
- **Test Scenarios**:
  1. **Mode A (Replica Set Active)**: Primary aggregate write and outbox event write executed inside a single `ClientSession` multi-document transaction.
     - Verify: Aggregate write abort rolls back outbox record atomically.
  2. **Mode B (Standalone / Non-Replica Set)**: Two-phase write with CAS fencing and L2 mutation receipts.
     - Verify: Crash between phase 1 and phase 2 is reconciled cleanly by `DWCPRecoverySweeper`.

### Layer 9: Human Governance & Security Boundaries
- **Target**: Consequential action safeguards in `TemporalConflictConsumer` and daemons.
- **Invariants Enforced**:
  1. All conflict repair proposals generated by `TemporalConflictConsumer` have `humanGovernanceStatus: "PENDING_CONFIRMATION"`.
  2. No database update mutates scheduled occurrence intervals without explicit user signature.
  3. Operational health endpoint `GET /api/system/outbox/health` requires authentication and redacts all payload data.

### Layer 10: Semantic Behavioral Generalization (15 Held-Out Categories)
- **Target**: Intelligence-to-Kernel handoff boundary tested against independent, unseen natural language inputs.
- **The 15 Mandatory Generalization Categories**:
  1. **Unseen Natural-Language Phrasing**: Slang, colloquialisms, non-standard grammar.
  2. **User-Created Custom Signals**: Arbitrary new biometric or mood keys (e.g. `"focus_depth"`, `"hydration_level"`).
  3. **Unknown But Valid Entity Names**: Novel task or project titles with domain keywords in the title (e.g. `"Review Goal Setting Paper"`).
  4. **New Domain Categories**: Cross-domain activities (e.g. `"Meditative Rucking"`).
  5. **Multilingual Input**: Spanish, French, German commands.
  6. **Hinglish Input**: Mixed Hindi-English phrasing (e.g. `"Gym session log karo 45 mins ke liye"`).
  7. **Contextual References**: Anaphora and relative pronouns (e.g. `"Complete that task I made yesterday"`).
  8. **Ambiguous Instructions**: Intent with missing parameters; intelligence must request clarification, not guess.
  9. **Multiple Intentions in One Message**: Compound actions (e.g. `"Log a 30 min workout and complete the morning routine task"`).
  10. **Dynamic Capability Registration**: Calling tools registered at runtime.
  11. **Missing Context**: Missing timezone or date; kernel must safely request defaults.
  12. **Unsupported Operations**: Operations outside LifeOS domain; kernel must reject truthfully without inventing actions.
  13. **Explicit User Corrections**: User reversing or correcting previous prompt.
  14. **Valid Intent with Temporarily Unavailable Persistence**: Safe degraded handling.
  15. **Novel Combinations of Known Operations**: Sequencing temporal scheduling with goal milestone links.
- **Pass Criteria**: Intelligence layer produces grounded structured intent; kernel strictly validates structured contracts; 0 regex or hardcoded keyword fallbacks used in the kernel.

---

## 3. Test Suite Implementation Battery

### Canonical Execution Command
All Step 2 test suites are executed using Node.js's native test runner via `tsx`:
```bash
npx tsx --tsconfig packages/execution-kernel/tsconfig.json --test packages/execution-kernel/src/testing/step2/*.test.ts
```

| Test Suite File | Layers Covered | Minimum Target Test Count | Justification |
| :--- | :---: | :---: | :--- |
| `packages/execution-kernel/src/testing/step2/ConsumerUnitBattery.test.ts` | 2 | 28 tests | 4 tests $\times$ 7 consumers (`NOT_YET_APPLIED`, `ALREADY_APPLIED`, `ALREADY_SUBSUMED`, `RETRYABLE_FAILURE`). |
| `packages/execution-kernel/src/testing/step2/CausalMonotonicityMatrix.test.ts` | 2, 5 | 16 tests | Cross-aggregate independence, constituent map tests, per-node versioning, sweep revision CAS. |
| `packages/execution-kernel/src/testing/step2/EndToEndConvergence.test.ts` | 3 | 14 tests | Mutation $\to$ Dispatcher $\to$ Consumer $\to$ Projection $\to$ `waitForConvergence`. |
| `packages/execution-kernel/src/testing/step2/ConcurrencyContention.test.ts` | 5 | 12 tests | Parallel task completions, workout logging, concurrent day sweeps, graph unblocking. |
| `packages/execution-kernel/src/testing/step2/FailureInjectionPoisonPill.test.ts` | 6 | 12 tests | Worker crashes mid-batch, partial acknowledgment, DLQ quarantine, DLQ manual replay. |
| `packages/execution-kernel/src/testing/step2/DeterministicRebuild.test.ts` | 7 | 10 tests | Drop-and-rebuild verification across all 7 projections; streak recomputation from DailyLog. |
| `packages/execution-kernel/src/testing/step2/ModeAParity.test.ts` | 8 | 8 tests | Multi-document Mongo transactions vs Mode B two-phase CAS compensation. |
| `packages/execution-kernel/src/testing/step2/HumanGovernanceBoundary.test.ts` | 9 | 8 tests | Temporal proposals strictly `PENDING_CONFIRMATION`; health route authentication & data redaction. |
| `packages/execution-kernel/src/testing/step2/SemanticArchitectureAST.test.ts` | 4 | 8 tests | Structural AST scanning for 0 regex intent, 0 keyword classifiers, 0 bypasses. |
| `packages/execution-kernel/src/testing/step2/SemanticBehavioralGeneralization.test.ts` | 10 | 15 tests | 15 held-out natural language categories testing intelligence-to-kernel boundary. |
| **All Existing B1–B4 & Step 1 Regression Tests** | All | 222 tests | Uncompromising regression baseline across 914 audited files. |
| **Total Test Scope** | **All** | **353 target tests** | **100% Target Pass Rate** |
