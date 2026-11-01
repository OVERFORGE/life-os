# LIFEOS — STEP 3 ARCHITECTURAL CHANGELOG
## Historical Evolution, Decisions & Architectural Decision Records (ADRs)
**Milestone:** Step 3 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Specification  
**Authority:** The Executioners (ExE)  
**Status:** RECONCILED & AUDIT-VERIFIED  

---

## 1. VERSION EVOLUTION SUMMARY

```
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
| Version | Date           | Core Changes & Architectural Scope                                        |
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
| V1.0.0  | Oct 2026       | Initial Step 3 planning specification: reactive SSE delivery concept,     |
|         |                | Web Locks multi-tab coordination, basic invalidation tags.                 |
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
| V2.0.0  | Oct 31, 2026   | First formal correctness revision: introduced Four-Tier Ordering concept, |
|         |                | identified gap between outbox dispatch and UI updates.                    |
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
| V2.1.0  | Nov 01, 2026   | Second correctness revision: initial 24-event inventory attempt,          |
|         |                | documented standalone Node.js deployment, prohibited URL query tokens.    |
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
| V2.2.0  | Nov 01, 2026   | Final pre-implementation revision: solved worker pause-reorder race via   |
| (Active)|                | leased delivery journaling, 5-point exact interval coverage proof,        |
|         |                | set-theoretic publication gate, reconciled all 24 events with codebase.   |
+─────────+────────────────+───────────────────────────────────────────────────────────────────────────+
```

---

## 2. HISTORICAL ARCHITECTURAL DECISION RECORDS (ADR-01 TO ADR-18)

- **ADR-01: Server-Sent Events (SSE) as Sovereign Egress Transport**: Selected SSE over WebSockets for client egress invalidation to minimize connection state overhead and traverse enterprise firewalls natively.
- **ADR-02: Multi-Tab Coordination Architecture**: Single Leader tab holds the SSE connection via Web Locks; Follower tabs receive invalidations over `BroadcastChannel`.
- **ADR-03: Reactive Invalidation vs. Full Entity Streaming**: SSE frames carry lightweight invalidation tags and sequence tokens; client UI rehydrates via SWR against Step 2 projection collections.
- **ADR-04: Human-in-the-Loop Governance Boundary**: Transient 15-second ambient UI undo toast backed by authoritative 24-hour kernel compensation window (`AutonomousActionReverser.ts`).
- **ADR-05: Desktop Surface Integration**: Tauri desktop app connects via `DesktopSurfaceManager.ts` to `/api/surface/events` and updates tray via Tauri IPC.
- **ADR-06: Mobile Transport Model**: React Native mobile app streams via `XMLHttpRequest` (readyState 3 / LOADING) in `InteractionEventTransport.ts`.
- **ADR-07: Four-Tier Ordering Architecture**: Formal separation of Tier A ($Seq_{agg}$), Tier B ($deliverySeq$), Tier C ($Seq_{conn}$), and Tier D (`Last-Event-ID`).
- **ADR-08: Publication Eligibility Gate**: Delivery frames emitted only after projection consumers commit and outbox transitions to `DELIVERED`.
- **ADR-09: Ban on URL Query Tokens**: Prohibited tokens in query parameters to prevent credential leaks in access logs; web browser authenticates via same-origin NextAuth cookies.
- **ADR-10: Rule 9 AST Semantic vs. Structural Regex Differentiation**: Strict prohibition of semantic regex while permitting structural format validators (UUID, ISO-8601, email, headers).
- **ADR-11: Mobile Session Revocation Enforcement**: Extraction of `sessionId` from mobile JWT and database verification against `Session.isRevoked == false`.
- **ADR-12: Standalone Next.js Deployment Model**: Verified `output: "standalone"` in `apps/web/next.config.ts`, ensuring persistent Node.js sockets.
- **ADR-13: Reverse Proxy Flush Padding**: Initial 1024-byte comment flush to bypass intermediate reverse proxy chunk buffers.
- **ADR-14: Follower Degraded Mode**: Follower tabs enter on-demand SWR polling after 15s of leader silence without breaking browser locks.
- **ADR-15: Process-Local vs. Global Quotas**: Established process-local limits (3 streams/user/process, 500 total sockets/process) vs. global limits.
- **ADR-16: Four-Tier Testing Hierarchy**: Partitioned testing into Unit (Tier 1), In-Process Integration (Tier 2), Multi-Process Concurrency (Tier 3), and Deployment Verification (Tier 4).
- **ADR-17: Single-Concurrency Test Mandate**: Enforced `--test-concurrency=1` and `--max-old-space-size=4096` across all integration suites.
- **ADR-18: Latency Budget Decomposition**: Bounded reactivity latency across 6 distinct pipeline stages ($T_{mutation} \dots T_{rehydration}$).

---

## 3. V2.2 CRITICAL ARCHITECTURAL DECISION RECORDS (ADR-19 TO ADR-25)

### ADR-19: Leased Per-User Delivery Journaling Protocol
- **Context**: V2.1 allocated `deliverySeq` using a standalone `$inc` on `UserDeliverySequenceModel`. If Worker A allocated 101 and paused, Worker B could allocate 102 and publish first, causing sequence regression and permanent frame loss.
- **Decision**: Sequence allocation and wire publication are guarded by an atomic CAS lease in `PartitionLeaseModel` (`partitionKey: "${userId}:delivery:stream"`).
- **Consequence**: Only one worker at a time sequences and publishes for a given user. Events are persisted to `UserDeliveryJournalModel` with `status: "COMMITTED"` before any frame is transmitted. Eliminates worker pause-reorder races completely.

### ADR-20: 5-Point Exact Interval Coverage Theorem
- **Context**: V2.1 used a naive count check ($\text{count} == \text{currentSeq} - \text{lastAckSeq}$) which failed under duplicate records, compacted records, or concurrent cursor advancement.
- **Decision**: Replay is proven if and only if cardinality matches, lower/upper boundaries are exact, adjacent sequences are strictly contiguous ($S_{i+1} = S_i + 1$), and payloads are valid.
- **Consequence**: Incomplete replay emits `system.resync_required`, prompting full client SWR rehydration. Zero risk of dropped events or ghost gaps.

### ADR-21: Set-Theoretic Publication Eligibility Gate
- **Context**: V2.1 conflated outbox and consumer ledger states (`COMPLETED` vs `DELIVERED`, `FAILED` vs `FAILED_TERMINAL`) and used a loose `length` comparison.
- **Decision**: Reconciled states against repository code. Gate asserts $Req(E) \subseteq Succeeded(E)$ as a mathematical set, and verifies `OutboxEventModel.deliveryStatus === "DELIVERED"`.
- **Consequence**: Failed or dead-lettered required consumers permanently block publication. Dirty reads eliminated 100%.

### ADR-22: Reconciliation of the 24 Canonical Events
- **Context**: V2.1 contained discrepancies in event names (`progress_recorded` vs `progress_updated`, `archived` vs `deleted`).
- **Decision**: Reconciled all 24 events against `CanonicalPayloadSchemaMap` in `CanonicalEventSchemas.ts` and the 7 Step 2 consumer registries.
- **Consequence**: Exhaustive compile-time typing via `Record<CanonicalEventType, ICanonicalDeliveryDefinition>`. Zero runtime fallbacks.

### ADR-23: Mobile Transport Bearer Token Attachment
- **Context**: Audit of `apps/mobile/services/InteractionEventTransport.ts` revealed that `xhr.open()` omitted the `Authorization: Bearer` header.
- **Decision**: Mandated retrieval of stored token from `AsyncStorage.getItem('user_token')` and header injection prior to stream initiation in Loop 4/5.
- **Consequence**: Mobile streaming adheres to zero-trust bearer token authentication.

### ADR-24: Authoritative Connection Governance Reconciliation
- **Context**: Historical documentation contained conflicting thresholds (3 vs 5 streams, 50 vs 100 frames).
- **Decision**: Reconciled authoritative thresholds: 3 streams/user/process, 500 total sockets/process, 50-frame replay buffer, 15s server heartbeat, 30s client timeout, 10 reconnects/min/IP.
- **Consequence**: Eliminates developer ambiguity and bounds heap memory overhead to $< 300\text{MB}$.

### ADR-25: Multi-Process Concurrency & Chaos Testing Battery
- **Context**: Previous testing specifications lacked explicit tests for worker pause-reorder races, crash boundaries, and slow consumers.
- **Decision**: Mandated 20 explicit test batteries across Tiers 1–4, including concurrent sequence allocation races, crash-after-journal recovery, and browser leader suspension.
- **Consequence**: All distributed failure modes are automatically verified in CI.
