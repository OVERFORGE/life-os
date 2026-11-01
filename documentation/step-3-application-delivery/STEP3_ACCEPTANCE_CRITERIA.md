# LIFEOS — STEP 3 ACCEPTANCE CRITERIA MATRIX
## Formal Verification Contracts, Multi-Stage Latency Budgets & Quality Gates
**Milestone:** Step 3 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Specification  
**Authority:** The Executioners (ExE)  
**Status:** RECONCILED & MEASURABLE  

---

## 1. ACCEPTANCE CRITERIA CLASSIFICATION TAXONOMY

Every criterion is categorized according to its engineering failure impact:
- **Hard Correctness Requirement (HCR)**: Non-negotiable mathematical, causal, or security invariant. A single violation fails verification.
- **Performance Objective (PO)**: Statistical latency or throughput target measured across $N \ge 200$ operations under warm cache conditions.
- **Resilience Objective (RO)**: System behavior under partition, process crash, network drop, or client suspension.
- **Resource Constraint (RC)**: Bounded memory, socket, or thread consumption ceilings.

---

## 2. SIX-STAGE LATENCY DECOMPOSITION & TARGETS

End-to-end reactivity ($T_{e2e}$) measures the duration from a client command dispatch to the visual re-render of projection truth in the client interface:
$$T_{e2e} = T_{mutation} + T_{outbox} + T_{convergence} + T_{invalidation} + T_{transport} + T_{rehydration}$$

```
+───────────────────────────+───────────────────────────+──────────+──────────+──────────+─────────────────────────────────────────────+
| Stage                     | Subsystem / Responsibility| p50 (ms) | p95 (ms) | p99 (ms) | Measurement Boundary                        |
+───────────────────────────+───────────────────────────+──────────+──────────+──────────+─────────────────────────────────────────────+
| 1. T_mutation             | Step 1 Kernel Aggregate   | 35       | 80       | 120      | HTTP dispatch to aggregate write & outbox   |
| 2. T_outbox               | Dispatcher Lease Polling  | 45       | 100      | 150      | Outbox record insert to worker lease acquire|
| 3. T_convergence          | Step 2 Projection Consumers| 55      | 120      | 180      | Consumer execution to projection commit     |
| 4. T_invalidation         | Step 3 Gate & Journaling  | 10       | 30       | 50       | Gate assertion to UserDeliveryJournal insert|
| 5. T_transport            | Step 3 Standalone SSE Wire| 15       | 50       | 80       | Socket write to client onmessage event      |
| 6. T_rehydration          | Step 3 Client SWR Refresh | 40       | 100      | 160      | Invalidation token to React DOM commit      |
+───────────────────────────+───────────────────────────+──────────+──────────+──────────+─────────────────────────────────────────────+
| Total End-to-End (T_e2e)  | Full Reactive Loop        | 200      | 480      | 740      | Command dispatch to UI fully converged      |
| Step 3 Pure Delivery      | T_invalidation+T_transport| 25       | 80       | 130      | Outbox DELIVERED to client onmessage        |
+───────────────────────────+───────────────────────────+──────────+──────────+──────────+─────────────────────────────────────────────+
```

---

## 3. THE 12 FORMAL ACCEPTANCE CRITERIA (AC-01 TO AC-12)

### AC-01: End-to-End Reactivity Latency
- **Classification**: Performance Objective (PO)
- **Assertion**: Under warm execution across $N \ge 200$ test operations, the end-to-end pipeline latency satisfies $T_{e2e} < 500\text{ms}$ at the 95th percentile ($p95$) and $< 250\text{ms}$ at the 50th percentile ($p50$).
- **Verification Harness**: Automated multi-client test harness (`sse-reactivity.integration.test.ts`) recording timestamps at client dispatch and DOM mutation observer trigger.

### AC-02: Zero Dirty-Read Invalidation
- **Classification**: Hard Correctness Requirement (HCR)
- **Assertion**: $P(\text{client rehydrates projection before consumer commits}) = 0$.
- **Verification Harness**: Publication Eligibility Gate unit and integration tests. Invalidate requests emitted while consumers are running or failed must be rejected 100% of the time.

### AC-03: Four-Tier Monotonic Delivery Ordering
- **Classification**: Hard Correctness Requirement (HCR)
- **Assertion**: For every user $U$, delivery sequence numbers $\text{deliverySeq}$ are strictly contiguous integers ($S_{i+1} = S_i + 1$) without sequence reuse or silent gaps. Any detected sequence regression or gap triggers an immediate `system.resync_required` event.
- **Verification Harness**: Concurrency test suite (`test_concurrent_delivery_sequence_allocation`, `test_worker_pause_resume_publication_reordering`).

### AC-04: Single Stream per Browser Origin Context
- **Classification**: Resource Constraint (RC)
- **Assertion**: Opening $K$ tabs ($2 \le K \le 10$) on the same browser origin results in exactly **one** active SSE TCP socket connection to `/api/surface/events`. Follower tabs receive invalidations via `BroadcastChannel` within $20\text{ms}$ of leader receipt.
- **Verification Harness**: Headless multi-tab browser test using Puppeteer/Playwright.

### AC-05: Follower Degraded Mode Resilience
- **Classification**: Resilience Objective (RO)
- **Assertion**: When the leader tab is throttled or suspended without releasing its Web Lock, follower tabs detect 15 seconds of silence, enter Follower Degraded Mode (local SWR polling), and maintain UI freshness without throwing `AbortError` or lock acquisition exceptions.
- **Verification Harness**: Tab freezing simulation harness (`test_browser_leader_suspension_and_follower_degraded_recovery`).

### AC-06: Transport Authentication & Revocation Integrity
- **Classification**: Hard Correctness Requirement (HCR)
- **Assertion**: 100% rejection of unauthenticated connections, revoked mobile sessions, or tampered JWTs. Zero authentication tokens are transmitted or accepted via URL query parameters.
- **Verification Harness**: Security integration test verifying cookie validation, bearer token signature checks, and MongoDB `Session.isRevoked` enforcement.

### AC-07: Process Socket Capacity & Bounded Heap Memory
- **Classification**: Resource Constraint (RC)
- **Assertion**: A single standalone Node.js process comfortably sustains up to **500 concurrent SSE sockets** with heap overhead $< 300\text{MB}$.
- **Verification Harness**: Load testing harness (`sse-load.test.ts`) maintaining 500 simulated connections with keep-alive pings over a 10-minute soak period.

### AC-08: Proxy Buffering Bypass
- **Classification**: Performance Objective (PO)
- **Assertion**: In the presence of reverse proxies (Nginx), the initial 1024-byte comment flush and `X-Accel-Buffering: no` header ensure the time-to-first-event is $< 100\text{ms}$ ($p95$).
- **Verification Harness**: Dockerized Nginx reverse proxy test container.

### AC-09: Authoritative 24-Hour Kernel Compensation Window
- **Classification**: Hard Correctness Requirement (HCR)
- **Assertion**: Client surfaces display a transient 15-second undo toast affordance; kernel transactions authoritatively accept reversals within 24 hours ($86,400,000\text{ms}$) and reject requests $> 24\text{h}$ via [`AutonomousActionReverser.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/reversal/AutonomousActionReverser.ts).
- **Verification Harness**: Governance integration test suite (`reversal-window.integration.test.ts`).

### AC-10: Rule 9 Semantic Architecture AST Compliance
- **Classification**: Hard Correctness Requirement (HCR)
- **Assertion**: Full repository audit reports **0 violations** of Semantic Architecture Rules. Step 3 code contains zero regex for semantic intent matching, keyword dictionaries, or switch-statement action dispatchers.
- **Verification Harness**: Automated AST scanner (`scripts/verify-semantic-architecture.ts`).

### AC-11: Replay Completeness & Lossless Reconnect
- **Classification**: Resilience Objective (RO)
- **Assertion**: Reconnecting clients with cursor gaps $\le 50$ resume stream delivery without full page reloads, satisfying the 5-point Exact Interval Coverage Theorem. Gaps $> 50$ trigger `system.resync_required`.
- **Verification Harness**: Network disruption test harness simulating socket aborts and reconnection.

### AC-12: Complete 24-Event Canonical Registry Coverage
- **Classification**: Hard Correctness Requirement (HCR)
- **Assertion**: All 24 canonical dotted events in `CanonicalPayloadSchemaMap` have explicit, typed entries in `CANONICAL_DELIVERY_REGISTRY`. Any unregistered event causes static type-checking and unit test failure.
- **Verification Harness**: Exhaustive TypeScript type check (`tsc --noEmit`) and registry unit test.
