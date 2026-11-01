# LifeOS / Aven — Milestone B4
# Testing and Verification Plan (V2.3.0 Synchronized)
**Project:** LifeOS Adaptive Personal Operating System  
**AI Companion:** Aven  
**Milestone:** B4 — Autonomous Proactive Orchestration & Closed-Loop Adaptive Execution (APO-CLAE)  
**Document:** `B4_TESTING_AND_VERIFICATION_PLAN.md`  
**Revision:** V2.3.0  
**Execution Boundary:** RESEARCH AND PLANNING ONLY — IMPLEMENTATION STRICTLY UNAUTHORIZED  

---

## 1. Verification Strategy & Objectives

The primary objective of Milestone B4 verification is to prove that LifeOS can operate **autonomously, durably, and safely in the background** without human prompt turns, while maintaining absolute causal integrity, zero notification storms, and bulletproof crash, stale-worker, and ring-buffer eviction resilience.

The verification harness spans three testing tiers:
1. **Unit Verification (Deterministic / In-Memory):** Strict schema validation, HMAC signature computation with constant-time comparison, lease epoch generation, 11-step staging logic, and interruption cost formulas with conservative missing-data semantics.
2. **Integration Verification (MongoDB Database / Real Transaction Boundaries):** Universal outbox publication across all API endpoints, atomic pipeline lease contention resolution across concurrent worker nodes, durable action journal persistence, stale worker commit rejection in replica-set and standalone modes, and multi-aggregate DWCP compensation with L1/L2 receipt inspection.
3. **End-to-End & Chaos Verification (Simulated Failure Scenarios):** Time-shifted fake-clock testing of 15 mandatory failure modes, simulated node crashes, process stalls, network disconnects, receipt ring buffer evictions, and multi-surface reactive delivery.

---

## 2. Deterministic Fake-Clock & Concurrency Test Harness

Because Milestone B4 is temporally and concurrently driven (circadian cadence curves, lease TTLs, cooldown intervals, morning wake boundaries, and concurrent worker acquisitions), tests must not rely on wall-clock `setTimeout` or arbitrary sleeps.

B4 introduces two deterministic test utilities:

### 2.1 The Deterministic Fake-Clock Harness (`TestTemporalHarness.ts`)
```typescript
export class TestTemporalHarness {
  private currentTime: Date;

  constructor(initialTime: Date = new Date("2026-10-31T06:00:00.000Z")) {
    this.currentTime = new Date(initialTime);
  }

  public now(): Date {
    return new Date(this.currentTime);
  }

  public advanceMinutes(minutes: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + minutes * 60 * 1000);
  }

  public advanceHours(hours: number): void {
    this.advanceMinutes(hours * 60);
  }

  public advanceSeconds(seconds: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + seconds * 1000);
  }

  public setTime(time: Date): void {
    this.currentTime = new Date(time);
  }
}
```

### 2.2 The Deterministic Concurrency Barrier (`TestConcurrencyBarrier.ts`)
Used to coordinate multi-worker race conditions and process stalls without non-deterministic timing:
```typescript
export class TestConcurrencyBarrier {
  private waitList: Array<() => void> = [];

  constructor(private parties: number) {}

  public async wait(): Promise<void> {
    return new Promise((resolve) => {
      this.waitList.push(resolve);
      if (this.waitList.length >= this.parties) {
        const toRelease = [...this.waitList];
        this.waitList = [];
        toRelease.forEach((r) => r());
      }
    });
  }
}
```

---

## 3. The 10 Specific DWCP Mutation Receipt Recovery Tests (Issue Corrected)

The following 10 deterministic failure injection tests directly verify the L1/L2 durable mutation receipt architecture:

| # | Test Identifier | Test Name & Injection Point | Expected System Behavior | Verification Check |
|---|---|---|---|---|
| **A** | `dwcp-receipt-eviction-l1` | Original receipt evicted after 60 subsequent mutations on Aggregate X. | Receipt evicted from Aggregate X's `recentMutationReceipts` ring buffer; remains intact in L2 `MutationReceiptModel`. | Ring buffer lookup returns miss; L2 lookup returns hit with `status: 'COMMITTED'`. |
| **B** | `dwcp-recovery-post-eviction` | Worker crashes mid-workflow; recovery runs after 60 subsequent mutations on Aggregate X. | Recovery falls back to L2 `MutationReceiptModel`; correctly identifies mutation was applied; does NOT re-apply. | Zero duplicate aggregate mutations; workflow cleanly resolves without error. |
| **C** | `dwcp-recovery-post-compensation` | Step 1 was compensated; recovery worker crashes; second recovery worker runs. | Second recovery queries L2 `MutationReceiptModel`; detects `status: 'COMPENSATED'`. | Skips compensation for Step 1; zero redundant inverse writes. |
| **D** | `dwcp-dual-receipt-precedence` | Aggregate contains older `APPLIED` receipt and newer `COMPENSATED` receipt for same `stepMutationId`. | Recovery evaluates precedence rule: `COMPENSATED` state takes absolute precedence. | Final authoritative status is `COMPENSATED`; no re-compensation. |
| **E** | `dwcp-duplicate-recovery-workers` | Two recovery workers concurrently detect expired intent and attempt resolution. | Atomic CAS `findOneAndUpdate({ status: { $in: ['PREPARED', 'APPLYING'] } }, { $set: { status: 'RECOVERING' } })` yields exactly 1 winner. | Exactly 1 recovery worker executes; 2nd worker gracefully exits. |
| **F** | `dwcp-repeated-recovery-restarts` | Recovery sweeper runs 5 consecutive times across worker restarts. | Every run queries authoritative L1/L2 receipts; produces identical resolution. | 100% idempotent recovery execution verified. |
| **G** | `dwcp-l2-storage-unavailable` | L2 MongoDB connection drops during receipt query; aggregate ring buffer missed. | Sweeper does NOT assume `NEVER_APPLIED`; treats outcome as transiently unresolvable; pauses recovery. | Zero blind actions; retries upon DB reconnection. |
| **H** | `dwcp-indeterminate-missing-evidence` | Aggregate version progressed past `expectedVersion`; missing from both L1 and L2. | System CANNOT prove non-application; classifies as `INDETERMINATE_REQUIRING_INVESTIGATION`. | Transitions intent to `FAILED_TERMINAL`; raises Incident; pushes HITL card. |
| **I** | `dwcp-unresolved-beyond-window` | Workflow remains in recovery for $> 2$ hours without resolution. | Auto-escalates to `FAILED_TERMINAL`; preserves receipts for 30 days for forensic inspection. | `retentionExpiresAt` set to +30 days; incident alerted. |
| **J** | `dwcp-terminal-archival-ttl` | Workflow reaches terminal `COMMITTED` or `ABORTED` state. | Sets `retentionExpiresAt = Date.now() + 14 days` on all associated `MutationReceiptModel` records. | TTL index cleans up records after 14 days; zero permanent storage leak. |

---

## 4. The 15 Mandatory Milestone B4 Failure Scenarios Matrix

| # | Scenario | Failure Injection Point | Expected System Behavior | Verification Check |
|---|---|---|---|---|
| **1** | Concurrent Lease Initialization Race | 10 concurrent workers run `ensureLeaseRecord(userId)`. | Exactly 1 record created; 9 workers handle E11000 cleanly. | Singleton verified; zero unhandled errors. |
| **2** | Concurrent Lease Contention | 5 workers execute `acquireLease()` concurrently. | Exactly 1 worker wins; 4 receive `null`. | Zero duplicate leases; atomic CAS verified. |
| **3** | Stale Worker Rejection on Untouched Aggregate | Worker A (epoch 101) stalls; Worker B acquires 102; Worker A resumes. | Commit boundary rejects Worker A with `FencedOutError`. | Zero stale writes committed in Replica-Set & Standalone. |
| **4** | Lease Epoch Persistence Across Restart | Worker restarts / cleanups occur. | `durableEpoch` advances monotonically; never resets. | Unbroken monotonic sequence verified. |
| **5** | DWCP Recovery After L1 Ring Buffer Eviction | Step 1 commits to Aggregate X; 60 subsequent mutations evict receipt from L1 ring buffer. | Recovery queries L2 `MutationReceiptModel`, proves commit, and resolves cleanly without re-executing. | Zero duplicate executions; authoritative commit recognized. |
| **6** | Authoritative Anti-Overwrite Compensation | User edits aggregate before aborted workflow is compensated. | Conditional version check detects drift; skips compensation. | User manual edit is preserved 100%. |
| **7** | Both APPLIED and COMPENSATED Receipts Resolution | Stored receipts show both `COMMITTED` and `COMPENSATED`. | Recovery establishes `COMPENSATED` as authoritative final state; skips duplicate compensation. | Final state is COMPENSATED. |
| **8** | Interruption Cost Bounds Consistency | Permutations of DND, Quiet Hours, Meetings, Biometrics. | Cost mathematically verified strictly in $[0.0, 1.0]$. | All boundary assertions pass. |
| **9** | Conservative UNKNOWN State Suppression | Telemetry disconnected; `CognitiveState === UNKNOWN`. | Maximum cost penalty applied; non-critical alert suppressed. | Suppressed with explicit missing-data rationale. |
| **10** | Strict Emergency Bypass | Test `CRITICAL_EMERGENCY` vs `HIGH` during active DND. | Emergency alert delivers; ordinary HIGH alert strictly held. | Quiet hours & DND boundaries enforced. |
| **11** | Lossless Same-Timestamp SSE Replay | 5 events emitted in same millisecond. | Events assigned monotonic `deliverySeq`; replayed in order. | Client receives all 5 events without omission. |
| **12** | Duplicate-Safe Client Reconnect | Client reconnects with `lastAckSeq: 102` (events 103–105 pending). | Server replays only 103–105; client acknowledges. | Zero duplicates processed. |
| **13** | Replay After Status Change | Intervention transitions `PENDING` $\to$ `EXPIRED`. | Delivery receipt remains recoverable until client ACK. | Client receives expiration event notification. |
| **14** | HMAC Tampering & Replay Rejection | Payload altered or approved response replayed. | Tampering fails HMAC check; replay fails CAS state check. | HTTP 409 / 401; zero duplicate executions. |
| **15** | Full Evidence-Backed Outbox Coverage | Execute Task CRUD, Goal CRUD, and Calendar mutations. | All routes emit verified outbox events with incremented versions. | 100% causal event coverage verified. |

---

## 5. Test Suite Inventory & Structure

```
packages/execution-kernel/src/testing/
├── b4UniversalCausalSchemas.test.ts      (Loop 1: Schemas, validation, registry)
├── b4OutboxClosure.test.ts               (Loop 2: Entity mutations, outbox transactional guarantees)
├── b4AutonomousLeaseDaemon.test.ts       (Loop 3: Monotonic epoch CAS, heartbeat, conditional release)
├── b4DurableActionJournal.test.ts        (Loop 4: Action logging, cooldowns, missing-data cost evaluator)
├── b4ClosedLoopStrategies.test.ts        (Loop 5: Dual-tier scheduler, morning brief, energy alignment)
├── b4AutonomousWorkflowExecution.test.ts (Loop 6: Safe staging, DWCP recovery, L1/L2 receipt eviction tests A-J)
├── b4ReactiveSurfaceStream.test.ts       (Loop 7: SSE streaming, cursor replay, presence tracking)
└── b4EndToEndFailureBattery.test.ts      (Loop 8: 15/15 Failure scenarios + HMAC verification)
```

---

## 6. Non-Breaking Regression Battery

Prior to certifying Milestone B4, the entire historical test battery must execute with 100% pass rates:
1. **Milestone B1 Regression Battery:** `packages/execution-kernel/src/testing/b1*.test.ts` (33/33 PASS).
2. **Milestone B2 Regression Battery:** `packages/execution-kernel/src/testing/b2*.test.ts` (42/42 PASS).
3. **Milestone B3 Regression Battery:** `packages/execution-kernel/src/testing/b3*.test.ts` (41/41 PASS).
4. **Stage 1–4 Legacy Regression Battery:** `phase19IterativeAgencyEngine.test.ts`, `phase20DurableMemoryEngine.test.ts`, `phase21OutcomeVerification.test.ts`, `phase22DynamicWorkflowOrchestration.test.ts` (148/148 PASS).
5. **Type Safety & Build Cleanliness:** `npx tsc --noEmit -p packages/execution-kernel` (0 errors).

---

## 7. Definition of Done & Sign-Off Checklist

- [ ] Universal outbox covers 100% of Task, Goal, and Schedule mutations across routes and adapters.
- [ ] Distributed lease lock prevents dual-master execution under concurrency.
- [ ] Stale worker losing lease ownership is rejected at commit boundary (`FencedOutError`) in both Replica-Set and Standalone modes.
- [ ] Monotonic epoch counter survives database cleanups and restarts without resetting.
- [ ] Multi-aggregate workflows guarantee all-or-nothing consistency via Replica-Set transactions or DWCP with durable L1/L2 mutation receipts.
- [ ] DWCP recovery safely handles ring buffer evictions by consulting durable `MutationReceiptModel`.
- [ ] Anti-overwrite protection ensures DWCP compensation never destroys newer legitimate user mutations.
- [ ] Missing evidence across both L1 and L2 is classified as `INDETERMINATE`, never assumed `NEVER_APPLIED`.
- [ ] Receipts are retained indefinitely during active workflows and archived with a 14-day TTL upon terminal completion.
- [ ] Emergency bypass rigor ensures only `CRITICAL_EMERGENCY` alerts bypass DND/Quiet Hours; `HIGH` alerts are held.
- [ ] HMAC signature protects proposal tamper-proofing; user authentication proves authorization.
- [ ] Approvals are single-use and atomic; duplicate or replayed responses are rejected.
- [ ] `UNKNOWN` cognitive state conservatively suppresses non-critical alerts.
- [ ] Dual-tier scheduler evaluates Tier 1 in $<5$ms and applies adaptive backoff after no-op cycles.
- [ ] Lossless SSE replay delivers all events via `deliverySeq` cursor.
- [ ] All 10 specific DWCP receipt recovery tests pass cleanly.
- [ ] All 15 failure injection scenarios pass cleanly in automated tests.
- [ ] All 264 existing regression tests pass with zero defects.
