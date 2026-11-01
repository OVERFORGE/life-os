# LifeOS / Aven — Milestone B4
# Architectural Diagrams Specification (V2.2.0 Synchronized)
**Project:** LifeOS Adaptive Personal Operating System  
**AI Companion:** Aven  
**Milestone:** B4 — Autonomous Proactive Orchestration & Closed-Loop Adaptive Execution (APO-CLAE)  
**Document:** `B4_ARCHITECTURE_DIAGRAMS.md`  
**Revision:** V2.2.0  
**Execution Boundary:** RESEARCH AND PLANNING ONLY — IMPLEMENTATION STRICTLY UNAUTHORIZED  

---

## 1. High-Level APO-CLAE System Architecture

```mermaid
graph TD
    subgraph "External Trigger Sources"
        UserMsg["User Message / HTTP Request"]
        DomainMut["Domain Mutation (Task / Goal / Cal)"]
        TempTick["Temporal Heartbeat Tick (60s)"]
    end

    subgraph "Milestone B2 & B4: Causal Ingestion & Universal Outbox"
        Outbox["Transactional Outbox (OutboxStorageService)"]
        Dispatcher["Durable Outbox Dispatcher"]
        ConsumerLedger["Consumer Ledger & Deduplication"]
    end

    subgraph "Milestone B1 & B3: Truth & Behavioral Reality"
        WorldModel["Personal World Model Bridge (B1)"]
        BehavioralJournal["Behavioral Observation Journal (B3)"]
        CadenceEngine["Cadence Profile & Circadian Curves (B3)"]
    end

    subgraph "Milestone B4: Leased Autonomous Execution Engine"
        LeaseLock["Distributed Lease Manager (Server-Time Pipeline CAS)"]
        DualTierSched["Dual-Tier Scheduler (Tier 1 Check vs Tier 2 Hydration)"]
        StrategyEngine["Adaptive Strategy Registry"]
        CostEval["Interruption Cost & Autonomy Policy Gate"]
    end

    subgraph "Actuation & Multi-Surface Delivery"
        SafeStaging["11-Step Safe Workflow Staging (ExecutionWorkspace)"]
        Stage3Verify["Stage 3 Outcome Verification Engine"]
        DWCPCommit["Durable Workflow Commit Protocol (DWCP)"]
        HITLGate["HMAC-Signed & Authenticated HITL Framework"]
        ReactiveStream["Multi-Surface Reactive Event Stream (SSE Replay)"]
        ActionJournal["Durable Proactive Action Journal (MongoDB)"]
    end

    DomainMut -->|Atomic Persist| Outbox
    Outbox --> Dispatcher
    Dispatcher --> ConsumerLedger
    ConsumerLedger --> BehavioralJournal
    BehavioralJournal --> CadenceEngine

    TempTick --> DualTierSched
    DomainMut -.->|Immediate Trigger| DualTierSched
    DualTierSched -->|Evaluation Due| LeaseLock
    LeaseLock -->|Fencing Token Granted| StrategyEngine
    StrategyEngine -->|Hydrate Context| WorldModel
    StrategyEngine -->|Hydrate Profiles| CadenceEngine
    StrategyEngine --> CostEval

    CostEval -->|Permitted: Non-Consequential| SafeStaging
    SafeStaging -->|Shadow Projection| Stage3Verify
    Stage3Verify -->|Invariants Passed| DWCPCommit
    DWCPCommit -->|Atomic Persist| Outbox
    Outbox --> ActionJournal

    CostEval -->|Permitted: Consequential| HITLGate
    HITLGate -->|Sign Proposal + HMAC| ReactiveStream
    ReactiveStream -->|Deliver Card| UserMsg
    UserMsg -->|Authenticated User Acceptance| HITLGate
    HITLGate -->|Atomic CAS + Signature Valid| SafeStaging
```

---

## 2. Stale-Worker Lease Fencing & Rejection Sequence (Replica-Set & Standalone)

```mermaid
sequenceDiagram
    autonumber
    participant NodeA as Worker Node A
    participant NodeB as Worker Node B
    participant DB as MongoDB (autonomous_execution_leases)
    participant Outbox as OutboxStorageService (Commit Boundary)

    Note over NodeA: Cycle 1: Worker Node A acquires lease
    NodeA->>DB: findOneAndUpdate(status: IDLE, pipeline: inc durableEpoch)
    DB-->>NodeA: Token Granted (Epoch: 101, Worker: NodeA)
    activate NodeA
    NodeA->>NodeA: Begin staging workflow mutations...

    Note over NodeA: STALL! OS pause / network partition at Node A (e.g. 100s)
    Note over DB: Lease expires at T = 90s (status remains expired in DB)

    Note over NodeB: T = 91s: Worker Node B wakes on tick
    NodeB->>DB: findOneAndUpdate(where: leaseExpiresAt < $$NOW, pipeline: inc durableEpoch)
    DB-->>NodeB: Token Granted (Epoch: 102, Worker: NodeB)
    activate NodeB
    Note over NodeB: Worker B works on Goal aggregates (leaves Task X untouched)
    NodeB->>Outbox: Commit Mode A/B (fencingEpoch: 102)
    Outbox->>DB: Validate lease activeEpoch == 102 && workerId == NodeB
    DB-->>Outbox: Valid!
    Outbox-->>NodeB: Commit Successful!
    deactivate NodeB

    Note over NodeA: T = 105s: Stalled Node A resumes execution!
    Note over NodeA: Node A attempts to commit a mutation on untouched Task X
    NodeA->>Outbox: Commit Mode A/B (fencingEpoch: 101)
    Outbox->>DB: Validate lease activeEpoch == 101 && workerId == NodeA
    DB-->>Outbox: FAILED! (activeEpoch is 102, activeWorkerId is NodeB)
    Outbox-->>NodeA: FencedOutError: Stale epoch 101 rejected!
    deactivate NodeA
    Note over NodeA: Node A aborts; ZERO stale mutations committed to database!
```

---

## 3. The 11-Step Safe Workflow Staging & Verification Lifecycle

```mermaid
flowchart TD
    Step1["1. DynamicWorkflowPlanner: Generate DAG"] --> Step2["2. AutonomyPolicyManager: Validate Permissions"]
    Step2 --> Step3["3. WorldModelBridge: Hydrate Live State"]
    Step3 --> Step4["4. Action Adapters: Check Preconditions"]
    
    Step4 --> Step5["5. ExecutionWorkspace: Stage in Scratchpad (Zero DB Writes)"]
    Step5 --> Step6["6. Compute Expected Resulting State (Shadow Projection)"]
    Step6 --> Step7["7. OutcomeVerificationEngine: Verify Invariants"]
    
    Step7 --> CheckInv{"Stage 3 Invariants Passed?"}
    CheckInv -- "No (Invariant Failure)" --> AbortStaging["Discard Scratchpad & Mark ABORTED (Zero DB Writes)"]
    CheckInv -- "Yes (Passed)" --> Step8["8. Revalidate Lease Fencing Token & Version Assumptions"]
    
    Step8 --> CheckEpoch{"Fencing Token & Versions Valid?"}
    CheckEpoch -- "No (Fenced Out / Drift)" --> AbortStaging
    CheckEpoch -- "Yes (Valid)" --> Step9["9. Atomic Commit (Replica-Set Transaction OR DWCP)"]
    
    Step9 --> Step10["10. Post-Commit Sanity Check"]
    Step10 --> Step11["11. ProactiveActionJournal: Record Outcome"]
```

---

## 4. Cryptographic HITL Authorization & Single-Use State Machine

```mermaid
sequenceDiagram
    autonumber
    participant Daemon as Autonomous Daemon
    participant HITL as HITLGovernanceEngine
    participant DB as MongoDB (autonomous_interventions)
    participant Surface as Reactive Surface Stream (SSE)
    actor User as Authenticated User Client
    participant API as POST /api/aven/interventions/respond
    participant Executor as AutonomousWorkflowExecutor

    Daemon->>HITL: Create Intervention Proposal (Actions, Rationale)
    HITL->>HITL: actionsHash = SHA256(canonicalJson(actions))
    HITL->>HITL: signature = HMAC-SHA256(userId + interventionId + actionsHash + expiresAt, Secret)
    HITL->>DB: Insert Intervention (status: 'PENDING', signature, actionsHash)
    HITL->>Surface: Push Proposal Card with HMAC Signature
    Surface-->>User: Render Interactive Card [Accept / Modify / Reject]

    User->>API: Click [Accept] with Session Auth Cookie
    activate API
    API->>API: Authenticate user: session.userId
    API->>DB: findOne(interventionId, userId: session.userId)
    API->>API: Verify constant-time HMAC signature over canonical actions
    API->>DB: findOneAndUpdate(status: 'PENDING', set: status: 'ACCEPTED') (Atomic CAS)
    
    alt Status was already ACCEPTED / REJECTED / EXPIRED
        DB-->>API: Null / Matched 0 (Race or Replay Detected!)
        API-->>User: HTTP 409 Conflict: Already processed or expired
    else Atomic Transition Successful
        DB-->>API: Updated Document (status: 'ACCEPTED')
        API-->>User: HTTP 200 OK (Accepted)
        deactivate API
        
        Note over Executor: Worker executes approved action
        Executor->>DB: findOneAndUpdate(status: 'ACCEPTED', set: status: 'EXECUTING')
        Executor->>Executor: Execute via 11-Step Safe Staging Lifecycle
        Executor->>DB: updateOne(status: 'EXECUTED')
    end
```

---

## 5. Dual-Tier Scheduler & Event-Aware Evaluation

```mermaid
flowchart TD
    Tick["Timer Tick (60s) OR Domain Event"] --> Tier1["Tier 1: Lightweight Evaluation (< 5ms)"]
    
    Tier1 --> QueryLease["Query Lease Index: nextScheduledEvaluationAt & status"]
    QueryLease --> IsDue{"Evaluation Due OR High-Priority Event?"}
    
    IsDue -- No --> Sleep["Skip Full Evaluation & Sleep (Zero Hydration)"]
    IsDue -- Yes --> AcquireLease["Acquire Distributed Lease (Server-Time Pipeline CAS)"]
    
    AcquireLease --> LeaseWon{"Lease Acquired?"}
    LeaseWon -- No (Contention) --> Sleep
    LeaseWon -- Yes (Epoch Granted) --> Tier2["Tier 2: Full Evaluation Cycle (< 250ms)"]
    
    Tier2 --> Hydrate["Hydrate World Model (B1) & Cadence Profiles (B3)"]
    Hydrate --> EvalStrategies["Evaluate Active Strategies (Briefing, Rebalance, Energy)"]
    EvalStrategies --> PolicyGate["Evaluate Hard Suppression (DND/Quiet Hours/Budget) & Cost"]
    
    PolicyGate --> ActionsTaken{"Actions Triggered?"}
    ActionsTaken -- "No (No-Op Cycle)" --> Backoff["Adaptive Backoff: nextScheduledEvaluationAt = now + 15m * 2^noops"]
    ActionsTaken -- "Yes (Action/HITL)" --> ResetBackoff["Reset consecutiveNoops = 0"]
    
    Backoff --> ReleaseLease["Release Lease & Update Audit"]
    ResetBackoff --> ReleaseLease
```

---

## 6. Durable Multi-Surface Reconnect & Monotonic Cursor Replay

```mermaid
sequenceDiagram
    autonumber
    actor Client as Desktop / Mobile Surface
    participant SSE as GET /api/aven/stream/reactive
    participant Presence as SurfacePresenceManager
    participant DB as MongoDB (surface_delivery_receipts)
    participant ACK as POST /api/aven/stream/ack

    Note over Client: Client reconnects after network disconnect
    Client->>SSE: Connect with Header: ?surfaceId=desk_1&lastAckSeq=1042
    activate SSE
    SSE->>Presence: Register surface presence (surfaceId, type: 'desktop_web', activeAt: now)
    
    SSE->>DB: Query: userId == session.userId && surfaceId == desk_1 && deliverySeq > 1042
    DB-->>SSE: Returns pending delivery receipts sorted by deliverySeq asc
    
    loop Replay Pending Interventions
        SSE-->>Client: event: intervention.proposed (deliverySeq: 1043)
        Client->>ACK: POST /stream/ack (ackSeq: 1043, surfaceId)
        ACK->>DB: Update Receipt (status: 'ACKNOWLEDGED')
        
        SSE-->>Client: event: intervention.proposed (deliverySeq: 1044)
        Client->>ACK: POST /stream/ack (ackSeq: 1044, surfaceId)
        ACK->>DB: Update Receipt (status: 'ACKNOWLEDGED')
    end
    
    Note over Client,SSE: Stream remains open for live real-time push
```

---

## 7. Authoritative DWCP Crash Recovery Flow (Issue 2 Corrected)

```mermaid
sequenceDiagram
    autonumber
    participant Sweeper as DWCPRecoverySweeper
    participant IntentDB as MongoDB (workflow_execution_intents)
    participant AggregateDB as Aggregate Roots (recentMutationReceipts)
    participant Outbox as OutboxStorageService

    Note over Sweeper: Sweeper tick runs every 60s
    Sweeper->>IntentDB: findOneAndUpdate(status: 'PREPARED'/'APPLYING', expiresAt < $$NOW, set: status: 'RECOVERING')
    IntentDB-->>Sweeper: Intent Claimed (workflowExecutionId: WF_901)
    activate Sweeper

    loop Inspect Each Staged Step
        Sweeper->>AggregateDB: findById(staged.aggregateId)
        AggregateDB-->>Sweeper: Aggregate Document with recentMutationReceipts
        Sweeper->>Sweeper: Check for stepMutationId in recentMutationReceipts
    end

    alt All N Steps Applied Successfully
        Sweeper->>IntentDB: updateOne(status: 'COMMITTED')
        Sweeper->>Outbox: Promote all PENDING_COMMIT outbox events to PENDING
        Note over Sweeper: Workflow safely recovered as COMMITTED!
    else Partial Application Detected (e.g. Step 1 applied, Step 2 unapplied)
        Sweeper->>IntentDB: updateOne(status: 'COMPENSATING')
        loop Compensate Applied Steps (Reverse Order)
            Sweeper->>AggregateDB: updateOne(where: version == resultingVersion, set: inverseUpdates)
            alt Aggregate version was superseded by newer user mutation
                Note over Sweeper: Version moved! Skip compensation to protect user edit
            else Normal Compensation
                Note over Sweeper: Inverse update applied; record status: 'COMPENSATED'
            end
        end
        Sweeper->>IntentDB: updateOne(status: 'ABORTED')
        Sweeper->>Outbox: Delete or mark PENDING_COMMIT outbox events as ABORTED
        Note over Sweeper: Workflow safely recovered as ABORTED with zero corruption!
    end
    deactivate Sweeper
```
