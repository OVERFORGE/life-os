# LIFEOS — STEP 4 TESTING STRATEGY
## Comprehensive Verification Strategy, Concurrency Chaos & Mathematical Invariant Testing

**Milestone:** Step 4 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Semantic Architecture  
**Authority:** The Executioners (ExE)  
**Status:** SPECIFICATION ONLY  
**Date:** November 2, 2026  

---

## 1. TESTING PHILOSOPHY & DISCIPLINE

In accordance with Section 6 of the Step 4 Charter, the verification strategy for Step 4 matches and exceeds the rigorous standards of Steps 2 and 3. Testing strictly avoids loose in-memory mock substitutions for distributed invariants:
1. **Real Database Infrastructure**: Tests involving transactions, CAS updates, partial indexes, and leased locks execute against real MongoDB semantics.
2. **Explicit Synchronization Barriers**: Concurrency tests employ deterministic synchronization barriers (rendezvous latches, `Promise.all` barriers) to test exact race windows rather than arbitrary timer sleeps.
3. **Single-Concurrency Runner**: All automated test executions in CI execute with `--test-concurrency=1` and `--max-old-space-size=4096` to prevent heap exhaustion or cross-test state leakage.
4. **Dual-Layer Semantic Verification**: Verification maintains two distinct layers:
   - **Layer A**: Structural AST compliance auditing all repository source files against Rules 1–9.
   - **Layer B**: Semantic behavioral generalization testing agents on held-out categories and unfamiliar user entities.

---

## 2. 25-DIMENSION TESTING BATTERY MATRIX

| Dimension | Testing Category | Target Subsystem | Method & Scope | Verification Harness |
| :--- | :--- | :--- | :--- | :--- |
| **D-01** | Unit Testing | All Step 4 Loops | Pure logic, fingerprint hashing, schema validation, timingSafeEqual. | `step4Loop1*.test.ts`, `step4Loop2*.test.ts` |
| **D-02** | Integration Testing | Subsystems & Routes | Next.js API routes, Mongoose models, service boundaries. | `step4Loop2HitlIngress.test.ts`, `step4Loop6Graph*.test.ts` |
| **D-03** | Real MongoDB Testing | State & Leases | Real MongoDB collection updates, indexes, and document queries. | All Step 4 integration suites |
| **D-04** | Replica-Set Transaction Testing | Ingress & Outbox | Multi-document ACID transactions via `session.withTransaction` (Mode A). | `step4Loop2HitlIngress.test.ts`, `step4Loop3Dwcp*.test.ts` |
| **D-05** | Standalone MongoDB Fencing Testing | Sweepers & CAS | Single-document conditional updates with version/epoch fencing (Mode B). | `step4Loop1*.test.ts`, `step4Loop3*.test.ts` |
| **D-06** | Multi-Process Concurrency Testing | Daemons & Workers | Independent Node.js processes competing for partition leases. | `step4ConcurrencyChaos.test.ts` |
| **D-07** | Controlled Race-Condition Testing | Idempotency & Sweepers | Rendezvous barrier triggering simultaneous writes on exact aggregate. | `step4ConcurrencyChaos.test.ts` |
| **D-08** | Property-Based Testing | Fingerprints & Hashes | Randomized payload generation checking hash determinism and collisions. | `step4Loop1IdempotencyStore.test.ts` |
| **D-09** | Model-Based State Machine Testing | Workflow Intent | Exhaustive state transitions across `COMMITTED`, `COMPENSATED`, `QUARANTINED`.| `step4Loop3DwcpSweeper.test.ts` |
| **D-10** | Crash Injection Testing | Action Adapters & Sweeper | Forced process kill at exact persistence boundaries. | `step4ConcurrencyChaos.test.ts` |
| **D-11** | Lease Expiry & Fencing Tests | Worker Leasing | Heartbeat renewal failure on expired lease; stale worker rejection. | `step4Loop5AutonomousDaemon.test.ts` |
| **D-12** | Duplicate Request Storms | Idempotency Store | 10+ concurrent identical action proposals sharing `{userId, idempotencyKey}`. | `step4Loop1IdempotencyStore.test.ts` |
| **D-13** | Out-of-Order Event Delivery | Secondary Sweeper | Sweeping partitions where occurrence events arrive in non-causal sequence. | `step4Loop4ScheduleSweeper.test.ts` |
| **D-14** | Duplicate Event Delivery | Graph Projection | Repeated `domain.task.completed` events; verifies idempotent projection CAS.| `step4Loop6GraphProjection.test.ts` |
| **D-15** | Partial Acknowledgment | HITL Ingress | Client drops connection immediately after submitting HTTP response in Mode B. | `step4Loop2HitlIngress.test.ts` |
| **D-16** | Worker Restart & Recovery | Idempotency & Daemons | Node.js process restart with cold in-memory cache; verifies DB recovery. | `step4Loop1IdempotencyStore.test.ts` |
| **D-17** | Deterministic Replay | Action Audit Store | Replaying captured action envelope sequence produces identical receipts. | `step4Loop1IdempotencyStore.test.ts` |
| **D-18** | Projection Rebuild Testing | Graph Projection | Complete DAG rebuild from primary Tasks/Goals using Revision Sandwich. | `step4Loop6GraphProjection.test.ts` |
| **D-19** | Security & Tenant-Isolation | HITL Ingress | Cross-tenant intervention submission; ensures 100% rejection. | `step4Loop2HitlIngress.test.ts` |
| **D-20** | Cryptographic Tampering & Replay | HITL Signatures | Bit-flip in HMAC signature or proposal payload; verifies HTTP 400. | `step4Loop2HitlIngress.test.ts` |
| **D-21** | Timezone & DST Testing | Autonomous Daemon | Simulates Category A (UTC) and Category B (deferral on invalid timezone). | `step4Loop5AutonomousDaemon.test.ts` |
| **D-22** | Semantic Generalization Testing | Agent Intelligence | Held-out categories, unfamiliar user entities, multilingual input, ambiguity.| `step4SemanticGeneralization.test.ts` |
| **D-23** | AST Architectural Regression | Monorepo-Wide | Automated scanner enforcing Rules 1–9 across all 1,169 audited source files. | `step4AstCompliance.test.ts` |
| **D-24** | Full Milestone Regression Suite | Steps 1–3 + B1–B4 | All 22 existing milestone test suites executed with zero failures. | `step1*.test.ts`, `step2/*.test.ts`, `step3/*.test.ts` |
| **D-25** | Performance & Resource Boundaries | Graph Reads & Daemon | Sub-5ms DAG cache hit benchmark; heap memory tracking under 4096MB. | `step4Loop6GraphProjection.test.ts` |

---

## 3. CONTROLLED CONCURRENCY CHAOS SPECIFICATIONS (LOOP 7)

Every concurrency chaos test in `step4ConcurrencyChaos.test.ts` explicitly specifies the five required distributed parameters:

### Scenario 1: TOCTOU Compensation Race via Canonical Outbox
- **Competing Operations**: Recovery Worker A attempting compensation rollback via `OutboxStorageService` vs. User Mutation Worker B updating primary aggregate.
- **Synchronization Point**: Rendezvous barrier: Worker A reads aggregate `mutationEpoch = 5`; pauses. Worker B advances `mutationEpoch = 6` and commits via outbox. Worker A resumes.
- **Expected Outcome**: Worker A's `OutboxStorageService.persistWithStandaloneFencing` throws `FencedOutError` or `ConcurrencyConflictError`. Worker A halts rollback and marks workflow `QUARANTINED`.
- **Invariant Protected**: Newer user mutations must NEVER be clobbered by delayed compensation rollbacks.
- **Failure Condition**: Aggregate overwritten to stale compensated state or version decremented.

### Scenario 2: Rapid-Fire Idempotency Request Storm ($N = 10$)
- **Competing Operations**: 10 simultaneous HTTP requests sharing identical `{ userId, idempotencyKey }`.
- **Synchronization Point**: `Promise.all` launch barrier firing 10 concurrent requests into `KernelCapabilityService.executeAction()`.
- **Expected Outcome**: Exactly 1 execution of the underlying domain action adapter; 9 requests await shared in-flight promise; all 10 receive identical result envelopes.
- **Invariant Protected**: Domain side-effects must execute exactly once per idempotent envelope.
- **Failure Condition**: Adapter invocation count $> 1$ or any caller receiving `VERSION_CONFLICT`.

### Scenario 3: Autonomous Daemon Lease Preemption on Clock Jitter
- **Competing Operations**: Stalled Daemon Worker A attempting heartbeat renewal vs. New Daemon Worker B claiming expired lease.
- **Synchronization Point**: Worker A pauses 35s (exceeding 30s lease TTL). Worker B claims lease with epoch $E+1$. Worker A resumes and calls `renewLease()`.
- **Expected Outcome**: Worker A's renewal returns `null` (fencing epoch mismatch). Worker A halts tick immediately. Worker B continues execution.
- **Invariant Protected**: At most one worker executes autonomous policies for a user at any time.
- **Failure Condition**: Both workers simultaneously ticking and updating user state.

### Scenario 4: Multi-Partition Reschedule & Mid-Sweep Publication Fencing
- **Competing Operations**: Temporal Schedule Sweeper computing conflict manifest for Date A vs. User rescheduling an occurrence from Date A to Date B.
- **Synchronization Point**: Sweeper reads occurrences at Date A partition revision $R_A=3$; pauses. User moves occurrence to Date B, advancing $R_A=4$ and $R_B=2$. Sweeper resumes and attempts publication commit for Date A.
- **Expected Outcome**: In Mode A, transaction detects `partitionRevision !== 3` and aborts cleanly. In Mode B, staged sweep lock CAS on `partitionRevision: 3` matches 0 docs and aborts cleanly. Stale report is discarded without overwriting database. Both partitions re-swept in subsequent cycle.
- **Invariant Protected**: Conflict reports must never reflect obsolete source occurrences across partition shifts.
- **Failure Condition**: Stale conflict report written to database for origin partition.

### Scenario 5: Concurrent Graph DAG Rebuild Race & Mid-Rebuild Mutation
- **Competing Operations**: Worker A and Worker B both detecting graph revision staleness and rebuilding DAG.
- **Synchronization Point**: Worker A captures $R_{\text{start}}=5$, reads tasks; concurrent mutation increments revision to 6; Worker A reads $R_{\text{end}}=6$; Worker A aborts rebuild via Revision Sandwich and retries. Worker B reads $R_{\text{start}}=6$, builds DAG, and commits via CAS `appliedGraphRevision: { $lt: 6 }`.
- **Expected Outcome**: Worker A's mid-read abort prevents publishing stale graph. Worker B's CAS commits fresh revision 6. Monotonicity preserved.
- **Invariant Protected**: Graph projection revisions advance monotonically with zero lost updates and zero stale snapshots.
- **Failure Condition**: Overwrite of projection with stale DAG or non-monotonic revision sequence.

### Scenario 6: Category B Timezone Deferral on Unknown User Timezone
- **Competing Operations**: Autonomous Daemon tick running daily lifecycle vs. User account with unconfigured timezone.
- **Synchronization Point**: Daemon ticks user with `user.settings.timezone: null`.
- **Expected Outcome**: Category A tasks (DWCP sweeps) execute under UTC epoch; Category B tasks (morning briefing, rollover) are **DEFERRED**; system logs `TIMEZONE_RESOLUTION_REQUIRED`. Zero notification dispatched.
- **Invariant Protected**: Wall-clock actions must never trigger at arbitrary hours under silent UTC defaults.
- **Failure Condition**: User receives morning briefing at 2:00 AM local time.

### Scenario 7: Mode B DIMIP Delayed Worker vs Sweeper Epoch Burn Race
- **Competing Operations**: Delayed HTTP worker committing HITL response vs. Background Recovery Sweeper.
- **Synchronization Point**: Worker writes `PENDING_COMMIT` outbox event with `fencingEpoch = 1` and pauses. Lease expires (`leaseExpiresAt <= now`). Sweeper claims lease via CAS. Sweeper finds intervention is still `PENDING` and executes atomic epoch burn: `mutationEpoch: 1 -> 2`. Sweeper marks outbox event `ABORTED`. Delayed worker resumes and attempts CAS: `status: "PENDING", mutationEpoch: 1`.
- **Expected Outcome**: Worker's CAS matches 0 docs because `mutationEpoch` advanced to 2! Delayed worker fails cleanly. Outbox event was already marked `ABORTED`. Zero orphaned decisions or lost events!
- **Invariant Protected**: No accepted intervention decision can exist without an outbox event.
- **Failure Condition**: Worker commits intervention while outbox event is marked `ABORTED`.

### Scenario 8: Action Adapter Result Envelope Reconstruction
- **Competing Operations**: Process crash after domain mutation commits vs. Client retry.
- **Synchronization Point**: Process killed after `OutboxStorageService` commits task completion. Retried request arrives with same `{userId, idempotencyKey}`.
- **Expected Outcome**: Kernel checks `MutationReceiptModel`, finds receipt, queries task aggregate / outbox draft, reconstructs original success envelope `{ type: "complete_task", success: true, taskTitle: "..." }`, updates `ActionAuditRecordModel.result`, returns result without re-executing adapter.
- **Invariant Protected**: Retrying an already-committed action returns the full original result envelope.
- **Failure Condition**: Adapter re-executed triggering `VERSION_CONFLICT` or empty result envelope returned.

---

## 4. SEMANTIC ARCHITECTURE COMPLIANCE & BEHAVIORAL GENERALIZATION

### Layer A: Structural AST Architecture Scan
- **Execution**: `npx tsx scripts/verify-semantic-architecture.ts`
- **Scope**: Audits all 1,169 TypeScript/TSX/JavaScript files across all 12 monorepo source directories (`packages/execution-kernel/src`, `apps/web/app`, `apps/web/features`, `apps/web/server`, `apps/web/components`, `apps/web/hooks`, `apps/web/lib`, `apps/mobile`, `apps/desktop`, `packages/desktop-runtime`, `packages/design-system`, `scripts`). (Total repository contains 1,358 executable files; initial AST check verified 947 core files).
- **Exclusions**: `node_modules`, `.next`, `dist`, `build`, `.git`, `.turbo`, `.obsidian`, test fixtures, mocks.
- **Fixture Verification**:
  - `structuralRegexAllowed.fixture.ts`: Asserts structural regexes (UUID, ISO timestamp, email) PASS with 0 violations.
  - `semanticRegexProhibited.fixture.ts`: Asserts prohibited semantic regexes (action matching, state guessing, urgency heuristics) FAIL with exact rule codes.
- **Threshold**: Exactly 0 violations permitted across Rules 1 through 9.

### Layer B: Semantic Behavioral Generalization Testing
- **Execution**: `pnpm --filter @lifeos/execution-kernel test src/testing/step4/step4SemanticGeneralization.test.ts`
- **Target Subsystem**: Agent Intelligence Layer (`SemanticIntentInterpreter`, `AuthoritativeEntityResolver`).
- **Test Scenarios**:
  1. **Held-Out Domains & Categories**: Unseen user goal types ("aeroponic gardening", "vintage watch restoration") classified without hardcoded keywords.
  2. **Unfamiliar User-Created Entities**: User creates entity "Project Obsidian"; resolves unambiguously across subsequent turns.
  3. **Colloquial & Informal Input**: Slang and indirect requests ("wrap up that gym thing from earlier") correctly ground to target aggregates.
  4. **Multilingual Input**: Cross-lingual expressions ("terminar la tarea de matemáticas", "terminei o treino") resolve cleanly.
  5. **Multi-Domain Intent**: Single utterance expressing goals, tasks, and temporal constraints simultaneously.
  6. **Pronouns & Anaphora**: Pronouns ("reschedule it to tomorrow", "mark them both done") resolve to correct antecedents.
  7. **Dynamic Tools**: System adapts to dynamically registered capabilities without code modifications.

---

## 5. UNAVAILABLE INFRASTRUCTURE PROTOCOL

If any test cannot be executed due to missing external infrastructure (e.g., external SMS gateways, production OAuth identity providers):
1. **Explicit Statement**: State exactly what could not be executed.
2. **Environment Definition**: Define the exact command, environment variables, and configuration needed.
3. **Classification**: Mark the test result **UNVERIFIED**.
4. **Strict Prohibition**: NEVER report an unexecuted or mocked-out test as **PASS**.
