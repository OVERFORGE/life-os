# LIFEOS — STEP 3 TESTING STRATEGY
## Four-Tier Testing Hierarchy, Concurrency Chaos Batteries & AST Semantic Enforcement
**Milestone:** Step 3 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Specification  
**Authority:** The Executioners (ExE)  
**Status:** RECONCILED & IMPLEMENTATION-READY  

---

## 1. TESTING PHILOSOPHY & ISOLATION MANDATE

Step 3 bridges kernel projection truth to user-facing reactive interfaces. Testing must verify not only functional happiness paths, but distributed race conditions, multi-process crash scenarios, and strict AST semantic compliance.

### Execution Constraints:
- **Zero Parallel Test Pollution**: All integration and multi-process test suites must run with `--test-concurrency=1`.
- **Heap Allocation**: Node.js test runner allocated `--max-old-space-size=4096` to prevent GC pauses during streaming chaos tests.
- **Evidence Differentiation**: In-memory unit tests and mocks must never be presented as proof of real multi-process or multi-instance deployment behavior.

---

## 2. THE FOUR-TIER TESTING ARCHITECTURE

```
+───────────────────────────────────────────────────────────────────────────────────────────────────+
| TIER 1: UNIT TESTS (In-Memory Contracts & Pure Functions)                                         |
| • Scope: Envelopes, Zod schemas, Option B event ID regex, 5-point exact interval coverage math,    |
|   canonical event discriminated unions, client SWR reducer functions.                             |
| • Execution: Fast, zero database, in-memory execution (< 5ms per test).                           |
+───────────────────────────────────────────────────────────────────────────────────────────────────+
                                                  │
                                                  ▼
+───────────────────────────────────────────────────────────────────────────────────────────────────+
| TIER 2: IN-PROCESS INTEGRATION TESTS (Single Process Node + In-Memory Mongo)                       |
| • Scope: OutboxDispatcher to PublicationEligibilityGate hook, MongoDB UserDeliveryJournalModel     |
|   writes, single-tab SSE route handler lifecycle, NextAuth cookie & mobile Bearer validation.     |
| • Execution: mongodb-memory-server, isolated database per suite.                                  |
+───────────────────────────────────────────────────────────────────────────────────────────────────+
                                                  │
                                                  ▼
+───────────────────────────────────────────────────────────────────────────────────────────────────+
| TIER 3: MULTI-PROCESS & CONCURRENCY CHAOS TESTS (Simulated Distributed Environment)               |
| • Scope: Concurrent worker sequence allocation races, worker pause/resume reordering tests,       |
|   crash between journal and wire emission, multi-tab Web Locks leader election and kill,          |
|   Follower Degraded Mode transitions, duplicate publication idempotency, cross-tenant leaks.       |
| • Execution: Child process spawns or concurrent worker leases with real timers and CAS fences.    |
+───────────────────────────────────────────────────────────────────────────────────────────────────+
                                                  │
                                                  ▼
+───────────────────────────────────────────────────────────────────────────────────────────────────+
| TIER 4: DEPLOYMENT & RUNTIME VERIFICATION (Pre-Production Deployment Scenarios)                   |
| • Scope: Standalone container execution (apps/web/server.js), reverse proxy Nginx buffering        |
|   with 1KB comment padding, slow consumer backpressure thresholds, session revocation during      |
|   active streams, multi-instance change stream event distribution.                                 |
| • Execution: Docker containers or standalone Node.js process with simulated network proxies.      |
+───────────────────────────────────────────────────────────────────────────────────────────────────+
```

---

## 3. EXPLICIT TEST BATTERIES ACROSS CONCURRENCY & FAILURE DOMAINS

To resolve Section 9 of the V2.2 Specification, the following 20 explicit test batteries must be implemented across Tiers 1–4:

### 3.1 Concurrency & Causal Ordering Batteries (Tier 3)
1. **`test_concurrent_delivery_sequence_allocation`**: Two workers concurrently allocate delivery sequences for the same user under partition lease. Assert monotonic non-overlapping ranges ($[101, 102]$) with zero gaps and zero sequence reuse.
2. **`test_worker_pause_resume_publication_reordering`**: Worker A pauses after allocating sequence 101; Worker B allocates sequence 102 and attempts to publish. Assert that Worker B is blocked by the per-user delivery lease, or that the sliding journal forces publication in order ($101 \rightarrow 102$).
3. **`test_duplicate_publication_idempotency`**: Simulate duplicate outbox delivery for the same `eventId`. Assert that `UserDeliveryJournalModel` enforces `{ userId, eventId }` unique index and ignores duplicate publication.
4. **`test_snapshot_to_stream_race`**: Client requests initial state snapshot while an invalidation frame is in flight. Assert that client processes snapshot first and reconciles frame via monotonic sequence fencing without backwards state regression.

### 3.2 Crash Recovery & Boundary Batteries (Tier 3)
5. **`test_crash_after_sequence_allocation`**: Worker crashes immediately after `$inc` on `UserDeliverySequenceModel` before writing `UserDeliveryJournalModel`. Assert recovery worker acquires lease, detects uncommitted sequence, and cleanly repairs sequence state without silent gaps.
6. **`test_crash_after_durable_record_creation`**: Worker writes journal record with status `COMMITTED`, but crashes before wire push. Assert recovery daemon discovers `COMMITTED` records and publishes them sequentially.
7. **`test_crash_after_publication_before_acknowledgment`**: Socket crashes after wire push before client acknowledgment. Assert reconnect with `Last-Event-ID` replays exact frame cleanly.
8. **`test_process_restart_and_graceful_shutdown`**: Standalone server receives `SIGTERM`. Assert server transmits `system.server_restarting` with reconnect jitter hints and closes all sockets within 5 seconds.

### 3.3 Replay Completeness & Cursor Chaos Batteries (Tier 1 & Tier 2)
9. **`test_exact_replay_interval_coverage_proof`**: Verify the 5-point theorem against valid sequences, missing records, out-of-order records, and duplicate records.
10. **`test_missing_and_compacted_records`**: Client requests sequence range where records were pruned by TTL. Assert server detects missing lower boundary and immediately emits `system.resync_required`.
11. **`test_unknown_cursor_and_cold_connection`**: Client connects without `Last-Event-ID` (cold connect) or with cursor from restored database. Assert server initializes baseline sequence without throwing errors.
12. **`test_multi_instance_reconnect`**: Client disconnects from Node Instance A and reconnects to Node Instance B. Assert Instance B queries shared `UserDeliveryJournalModel` and resumes stream seamlessly.

### 3.4 Publication Eligibility Gate Batteries (Tier 2)
13. **`test_publication_eligibility_all_consumers_succeeded`**: All required consumers record `SUCCEEDED` or `SKIPPED_STALE` and outbox status is `DELIVERED`. Assert event is approved for publication.
14. **`test_publication_eligibility_required_consumer_failed`**: One required consumer has status `FAILED_TERMINAL` or `FAILED_RETRYABLE`. Assert event is rejected from publication.
15. **`test_publication_eligibility_dead_letter_quarantine`**: Outbox transitions to `DEAD_LETTER`. Assert event is permanently blocked from delivery publication.
16. **`test_publication_eligibility_recovery_after_retry`**: Consumer initially fails retryably, then succeeds on retry attempt 2. Assert event becomes eligible only after second attempt succeeds.

### 3.5 Security, Governance & Runtime Batteries (Tier 2 & Tier 4)
17. **`test_session_revocation_during_active_stream`**: Mobile user session is marked `isRevoked: true` in MongoDB while SSE stream is active. Assert server detects revocation on next heartbeat cycle and terminates connection with HTTP 401.
18. **`test_slow_consumer_backpressure_termination`**: Simulated throttled client fails to drain socket. Assert server terminates socket after 50 frames buffer overflow without crashing process heap.
19. **`test_cross_tenant_isolation`**: User A's SSE connection attempts to subscribe or receive invalidations for User B. Assert strict 100% rejection and zero cross-tenant frame leakage.
20. **`test_browser_leader_suspension_and_follower_degraded_recovery`**: Leader tab is frozen. Follower tabs observe 15s silence, enter Follower Degraded Mode (local SWR polling), and resume leader SSE stream once leader tab terminates.

---

## 4. PERMANENT SEMANTIC ARCHITECTURE AST ENFORCEMENT

### 4.1 Linter Scope & Architecture Rules
The delivery tier is strictly governed by LifeOS V2.3.0 Rule 9:
> *"The delivery layer conveys events and invalidations; it does not interpret natural language or classify semantic intentions."*

Repository-wide scanning is enforced via [`scripts/verify-semantic-architecture.ts`](file:///d:/PROGRAMMING/Projects/life-os/scripts/verify-semantic-architecture.ts).

### 4.2 AST Structural vs. Semantic Regex Differentiation
To eliminate false positives, the TypeScript AST auditor employs explicit discrimination:

```
+───────────────────────────────────────────────────────────────────────────────────+
| PERMITTED STRUCTURAL SYNTAX REGEX                                                 |
| • UUID format:        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-...$/i              |
| • ISO-8601 timestamp: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/          |
| • Email address:      /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/        |
| • HTTP Auth Header:   /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/                      |
+───────────────────────────────────────────────────────────────────────────────────+
                                          ▲
                                          │ ALLOWED
                                     ─────┴─────
                                     ─────┬─────
                                          │ FORBIDDEN
                                          ▼
+───────────────────────────────────────────────────────────────────────────────────+
| PROHIBITED SEMANTIC INTENT REGEX                                                  |
| • Action matching:    /(create|update|delete|cancel)\s+(task|goal)/i             |
| • State guessing:     /(done|finished|completed|closed)/i                        |
| • Sentiment/priority: /(urgent|critical|high priority|asap)/i                     |
+───────────────────────────────────────────────────────────────────────────────────+
```

### 4.3 Reproducible AST Verification Baseline
Prior to Step 3 implementation authorization, the AST scanner executed across the entire repository:
- **Command**: `npx tsx scripts/verify-semantic-architecture.ts`
- **Scope**: 925 TypeScript source files audited.
- **Result**: **0 architectural violations detected**. 100% compliance with Rules 1 through 8.
- **Loop 7 Deliverable**: Dedicated positive and adversarial test fixtures (`structuralRegexAllowed.fixture.ts`, `semanticRegexProhibited.fixture.ts`) will be integrated into CI to ensure the delivery tier maintains this invariant permanently.
