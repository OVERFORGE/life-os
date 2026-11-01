# LIFEOS — STEP 3 GAP & RISK REGISTER
## System Failure Modes, Concurrency Vulnerabilities & Concrete Engineering Safeguards
**Milestone:** Step 3 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Specification  
**Authority:** The Executioners (ExE)  
**Status:** RECONCILED & DEFENSIVELY MITIGATED  

---

## 1. THE 12 ARCHITECTURAL RISKS (R-01 TO R-12)

```
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
| Risk ID | Failure Mode & Distributed Impact       | Severity | Engineering Mitigation & Architectural Invariant            |
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
| R-01    | Premature Invalidation (Dirty Reads)    | CRITICAL | Set-Theoretic Publication Eligibility Gate asserts all      |
|         | Client rehydrates read models before    |          | required consumers SUCCEEDED and outbox is DELIVERED        |
|         | Step 2 consumers commit to MongoDB.     |          | before emitting invalidation frame.                         |
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
| R-02    | Worker Pause-Reorder Concurrency Race   | CRITICAL | Leased Per-User Delivery Journaling: mutual exclusion via    |
|         | Worker A (101) pauses; Worker B (102)   |          | PartitionLeaseModel ("userId:delivery:stream") + pre-        |
|         | publishes first, causing sequence drop. |          | publication persistence in UserDeliveryJournalModel.        |
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
| R-03    | Multi-Tab Connection Exhaustion         | HIGH     | W3C Web Locks leader election (single socket per origin)    |
|         | Multiple open tabs exhaust browser socket|         | + process-local cap of 3 streams/user and 500 total.        |
|         | pool and Node server connection limits. |          |                                                             |
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
| R-04    | Credential Leakage in Proxy Logs        | HIGH     | Strict ban on URL query tokens (?token=...). Browser uses   |
|         | Passing bearer tokens in query params   |          | same-origin session cookies; mobile uses Authorization:     |
|         | leaks credentials in access logs.       |          | Bearer header.                                              |
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
| R-05    | Serverless Execution Socket Termination | HIGH     | apps/web/next.config.ts verified output: "standalone".      |
|         | Serverless edge lambdas abort long-lived|          | SSE sockets run on persistent Node.js HTTP server.          |
|         | persistent SSE streaming connections.   |          |                                                             |
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
| R-06    | Intermediate Reverse Proxy Buffering    | MEDIUM   | Transmit X-Accel-Buffering: no + 1KB initial comment flush   |
|         | Nginx buffers SSE frames until chunk    |          | padding to saturate proxy buffers on connection start.      |
|         | threshold is reached, adding latency.   |          |                                                             |
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
| R-07    | Undo Toast / Compensation Conflation    | HIGH     | Explicit two-layer governance: client displays 15s visual    |
|         | Conflating client 15s undo toast with   |          | toast; kernel authoritatively enforces 24-hour window via   |
|         | kernel compensation window.             |          | AutonomousActionReverser.ts.                                |
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
| R-08    | Rule 9 Semantic AST Violations          | CRITICAL | Repository-wide AST scanner with positive structural regex  |
|         | Delivery tier introduces regex intent   |          | fixtures and negative semantic classifiers. 925 files clean.|
|         | parsers or keyword action dispatchers.  |          |                                                             |
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
| R-09    | Unbounded Memory Leak in SSE Route      | HIGH     | req.signal abort listener cleans up heartbeat timers, drops |
|         | Abandoned sockets retain subscribers    |          | unacknowledged socket buffers, and decrements process count.|
|         | and write buffers indefinitely.         |          |                                                             |
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
| R-10    | Stalled or Throttled Web Locks Leader   | MEDIUM   | Follower Degraded Mode: after 15s silence, followers initiate|
|         | Suspended leader blocks invalidation    |          | local SWR polling on interaction without lock stealing.     |
|         | distribution across open tabs.          |          |                                                             |
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
| R-11    | Inexact Replay Interval & Ghost Gaps    | CRITICAL | 5-point Exact Interval Coverage Theorem: asserts cardinality|
|         | Count matching without interval proof   |          | and contiguous progression. Incomplete replay emits         |
|         | drops compacted or missing frames.      |          | system.resync_required.                                     |
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
| R-12    | Sensitive Domain Entity State Leakage   | MEDIUM   | SSE frames transport invalidation metadata (tags, IDs) only;|
|         | Full domain entities serialized into    |          | zero domain entity bodies are transmitted across the wire.  |
|         | wire frames, risking cache pollution.   |          |                                                             |
+─────────+─────────────────────────────────────────+──────────+─────────────────────────────────────────────────────────────+
```

---

## 2. DETAILED MITIGATION SPECIFICATIONS

### R-02: Worker Pause-Reorder Concurrency Race Mitigation
- **Vulnerability**: Two workers process mutations for the same user concurrently. Worker A gets sequence 101, pauses; Worker B gets sequence 102 and publishes 102. Client advances cursor to 102. When Worker A publishes 101, client rejects or drops it.
- **Safeguard**: Step 3 enforces **Per-User Delivery Sequencing Leases**:
  1. Sequence allocation and publication are guarded by `PartitionLeaseModel` (`${userId}:delivery:stream`).
  2. Exactly one worker at a time holds the sequencing lease for a user.
  3. Contiguous sequences are assigned in batch and persisted to `UserDeliveryJournalModel` with `status: "COMMITTED"` before any frame is transmitted.
  4. If a worker pauses or crashes, its lease expires after 5000ms. The successor worker resumes publication without creating sequence gaps or allowing regressions.

### R-10: Stalled Web Locks Leader & Follower Degraded Mode
- **Vulnerability**: In modern browsers, background tabs may be heavily throttled or suspended by OS energy savers. If the leader tab is throttled, `BroadcastChannel` messages halt, leaving follower tabs showing stale data.
- **Safeguard**:
  1. Follower tabs maintain a 15-second heartbeat timer.
  2. If no heartbeat ping is observed from the leader for $> 15\text{s}$, follower tabs transition to **Follower Degraded Mode**.
  3. In Degraded Mode, follower tabs do not attempt to forcefully steal the Web Lock (which causes runtime exceptions). Instead, when the tab receives focus or user interaction, it issues an on-demand SWR query to rehydrate active projections directly from the server.
  4. Follower tabs periodically re-attempt non-blocking lock acquisition (`{ ifAvailable: true }`). Once the leader tab closes or frees the lock, a follower seamlessly ascends to Leader.

### R-11: Broken Replay Interval & Exact Coverage Proof
- **Vulnerability**: An out-of-order sequence or compacted record can satisfy a naive count equation ($N = current - last$) while omitting critical intermediate events.
- **Safeguard**: The server verifies the complete 5-point theorem:
  - Cardinality matches exactly.
  - First sequence equals $\text{lastAckSeq} + 1$.
  - Last sequence equals $\text{currentSeq}$.
  - Every adjacent pair satisfies $S_{i+1} = S_i + 1$.
  - If any condition fails or $\Delta > 50$, the server emits `event: system.resync_required`, prompting client SWR cache to invoke `refreshAll()`.
