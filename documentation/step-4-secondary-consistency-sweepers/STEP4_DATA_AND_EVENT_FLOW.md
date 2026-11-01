# LIFEOS — STEP 4 DATA AND EVENT FLOW
## Authoritative Mutation Flows, Event Propagation & Recovery Paths

**Milestone:** Step 4 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Semantic Architecture  
**Authority:** The Executioners (ExE)  
**Status:** SPECIFICATION & CAUSAL FLOW MAPPING  
**Date:** November 2, 2026  

---

## 1. DURABLE ACTION IDEMPOTENCY & RESULT RECONSTRUCTION FLOW (LOOP 1)

```mermaid
sequenceDiagram
    autonumber
    actor Caller as Agent / Client API
    participant Kernel as KernelCapabilityService
    participant Memory as In-Memory Audit Cache
    participant DB as ActionAuditRecordModel
    participant ReceiptDB as MutationReceiptModel
    participant AggDB as Primary Aggregate / Outbox
    participant Adapter as ActionAdapter

    Caller->>Kernel: executeAction(envelope with idempotencyKey)
    Kernel->>Kernel: Calculate FP = SHA256(userId + actionType + canonicalJSON(payload))
    Kernel->>Memory: Check in-flight / cached record
    alt Cache Hit (In-Flight Execution Promise)
        Kernel-->>Caller: Await & return existing promise
    else Cache Hit (SUCCEEDED in memory)
        Kernel->>Kernel: Verify FP == cached.requestFingerprint
        Kernel-->>Caller: Return cached receipt immediately
    else Cache Miss (Check DB)
        Kernel->>DB: findOne({ userId, idempotencyKey })
        alt DB Hit (Existing Record)
            Kernel->>Kernel: Verify FP == record.requestFingerprint
            alt Fingerprint Mismatch
                Kernel-->>Caller: Throw HTTP 400 (IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH)
            else Status is SUCCEEDED
                Kernel->>Memory: Populate L1 cache
                Kernel-->>Caller: Return cached receipt from DB
            else Status is EXECUTING & leaseExpiresAt > now
                Kernel-->>Caller: Return HTTP 409 / 503 (RETRY_LATER)
            else Status is EXECUTING & leaseExpiresAt <= now (Crash Window Recovery)
                Kernel->>ReceiptDB: findOne({ clientMutationId: action.id })
                alt Receipt Found (Domain Mutation Succeeded Before Crash)
                    Kernel->>AggDB: Query aggregate / outbox draft payload
                    Kernel->>Kernel: Reconstruct original success result envelope
                    Kernel->>DB: updateOne({ status: "SUCCEEDED", result: reconstructedResult })
                    Kernel-->>Caller: Return reconstructed successful result
                else Receipt Missing & Aggregate Version == Expected
                    Kernel->>DB: updateOne({ leaseExpiresAt: now + 15s, $inc: { fencingEpoch: 1 } })
                    Kernel->>Adapter: execute(action, userId)
                    Kernel->>DB: updateOne({ status: "SUCCEEDED", result })
                    Kernel-->>Caller: Return newly executed result
                else Receipt Missing & Aggregate Version > Expected (Ghost Version)
                    Kernel->>DB: updateOne({ status: "QUARANTINED" })
                    Kernel-->>Caller: Throw HTTP 500 (IDEMPOTENCY_UNCERTAIN_QUARANTINED)
                end
            end
        else DB Miss (New Execution Claim)
            Kernel->>DB: create({ userId, idempotencyKey, requestFingerprint: FP, status: "EXECUTING", leaseExpiresAt: now + 15s, fencingEpoch: 1 })
            Kernel->>Adapter: execute(action, userId)
            Kernel->>DB: updateOne({ status: "SUCCEEDED", result })
            Kernel->>Memory: Cache result envelope
            Kernel-->>Caller: Return successful result
        end
    end
```

---

## 2. CRYPTOGRAPHIC HITL GOVERNANCE INGRESS FLOW (LOOP 2)

### 2.1 Mode A: Multi-Document Transaction Ingress (Replica Sets)

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Web Toast / Mobile Surface)
    participant Route as Next.js API (/api/surface/interventions/respond)
    participant Engine as HITLGovernanceEngine
    participant DB as AutonomousInterventionModel
    participant Outbox as OutboxEventModel

    User->>Route: POST { interventionId, response, signature, keyVersion }
    Route->>Route: Verify Session Cookie or Bearer Token
    Route->>Route: Extract userId strictly from session (Reject body userId)
    Route->>Engine: respondIntervention({ interventionId, userId, response, signature, keyVersion })
    Engine->>DB: findOne({ _id: interventionId, userId })
    alt Intervention Not Found
        Engine-->>Route: Throw 404 (Not Found)
    else Intervention Expired (now > expiresAt)
        Engine-->>Route: Throw ExpiredInterventionError (409)
    else Invalid State (status !== "PENDING")
        Engine-->>Route: Throw InvalidInterventionStateError (409)
    else Signature Validation
        Engine->>Engine: Buffer length pre-check (32 bytes / 64 hex chars)
        Engine->>Engine: crypto.timingSafeEqual(computedHMAC, signatureBuffer)
        alt Signature Mismatch
            Engine-->>Route: Throw TamperedInterventionError (400)
        else Valid Signature
            Engine->>DB: session.withTransaction()
            Note over Engine,Outbox: Atomic update intervention status AND insert OutboxEvent
            DB->>DB: updateOne({ _id: interventionId, status: "PENDING" }, { status: response, respondedAt: now })
            Outbox->>Outbox: create({ eventType: "domain.intervention.responded", deliveryStatus: "PENDING", payload })
            Engine-->>Route: Return { success: true, status: response }
            Route-->>User: HTTP 200 { success: true }
        end
    end
```

### 2.2 Mode B: Dual-Intent Monotonic Idempotent Protocol (Standalone MongoDB) with Atomic Epoch Burn

```mermaid
sequenceDiagram
    autonumber
    participant Worker as Delayed / Active Worker
    participant Outbox as OutboxEventModel
    participant DB as AutonomousInterventionModel
    participant Sweeper as DIMIP Recovery Sweeper

    Worker->>Outbox: Step 1: Write PENDING_COMMIT outbox intent with worker lease & fencingEpoch
    Worker->>Worker: Worker encounters GC pause or network delay...
    
    Note over Sweeper: Sweeper checks stale PENDING_COMMIT intents (leaseExpiresAt <= now)
    Sweeper->>Outbox: Claim expired intent lease via CAS ($inc: { leaseGeneration: 1 })
    Sweeper->>DB: Inspect intervention document
    alt Intervention status is still PENDING
        Sweeper->>DB: Atomic Epoch Burn: updateOne({ _id: id, status: "PENDING", mutationEpoch: E }, { $inc: { mutationEpoch: 1 } })
        alt Epoch Burn Succeeded (Sweeper fenced out worker)
            Sweeper->>Outbox: mark deliveryStatus: "ABORTED"
            Note over Worker: Delayed Worker resumes and attempts CAS:
            Worker->>DB: updateOne({ _id: id, status: "PENDING", mutationEpoch: E }, { status: response })
            Worker->>Worker: CAS matches 0 docs! Worker aborted cleanly; no lost outbox event!
        else Epoch Burn Failed (Worker committed while sweeper checked)
            Sweeper->>DB: Re-read intervention status -> status is ACCEPTED
            Sweeper->>Outbox: promote deliveryStatus: "PENDING"
        end
    else Intervention status is ACCEPTED / REJECTED (Worker already committed)
        Sweeper->>Outbox: promote deliveryStatus: "PENDING"
    end
```

---

## 3. DUAL-WRITE CRASH PROTECTION (DWCP) RECOVERY FLOW (LOOP 3)

```mermaid
flowchart TD
    Start["DWCP Sweeper Tick (Autonomous Worker Daemon)"] --> AcquireLease{"Acquire Lease: userId:dwcp:sweeper"}
    AcquireLease -->|Denied: Held by Another| Skip["Back off until next cycle"]
    AcquireLease -->|Acquired: Fencing Epoch N| FindStalled["Find WorkflowExecutionIntentModel: status == EXECUTING & updatedAt < now - 30s"]

    FindStalled --> LoopWorkflows["For each stalled workflow:"]
    LoopWorkflows --> CheckStep["Inspect current step in workflow"]
    CheckStep --> CheckL1{"Check Aggregate L1 Ring Buffer (recentMutationReceipts)"}

    CheckL1 -->|Receipt Present| StepCommitted["Step Status: COMMITTED (via L1)"]
    CheckL1 -->|Receipt Missing| CheckL2{"Check L2 Durable Store (MutationReceiptModel)"}

    CheckL2 -->|Receipt Present| StepCommittedL2["Step Status: COMMITTED (via L2)"]
    CheckL2 -->|Receipt Missing| CompareVersion{"Compare Aggregate Version vs Expected Version"}

    CompareVersion -->|version === expectedVersion| StepUnapplied["Step Status: NOT_APPLIED (Definitive)"]
    CompareVersion -->|version > expectedVersion| StepQuarantined["Step Status: QUARANTINED (Ghost Version Advancement)"]

    StepCommitted --> AdvanceWorkflow["Advance workflow to next step or mark COMMITTED"]
    StepCommittedL2 --> AdvanceWorkflow
    StepUnapplied --> RollbackSaga["Execute Canonical Compensation via OutboxStorageService"]
    StepQuarantined --> QuarantineWorkflow["Mark Workflow QUARANTINED (Prevent Split-Brain Corruption)"]

    RollbackSaga --> CanonicalOutbox{"Call OutboxStorageService: persistWithStandaloneFencing / persistWithTransaction"}
    CanonicalOutbox -->|Success: Version V -> V+1, Receipt Saved, Outbox Draft Created| CompSuccess["Step Compensated -> Mark Workflow COMPENSATED"]
    CanonicalOutbox -->|ConcurrencyConflictError / FencedOutError (Epoch or Version Changed)| CompAborted["TOCTOU Prevented -> Mark Workflow QUARANTINED"]
```

---

## 4. SECONDARY CONSISTENCY TEMPORAL SCHEDULE SWEEPER FLOW (LOOP 4)

```mermaid
sequenceDiagram
    autonumber
    participant Daemon as Autonomous Daemon (Sweeper)
    participant Sweeper as TemporalScheduleSweeper
    participant RevDB as TemporalPartitionRevisionModel
    participant OccDB as TemporalOccurrence Model
    participant RepDB as ScheduleConflictReportModel

    Note over OccDB,RevDB: Multi-Partition Reschedule advances Date A & Date B revisions atomically
    Daemon->>Sweeper: sweepStalePartitions(userId)
    Sweeper->>RevDB: Query partitions modified recently
    loop For each (userId, dateStr) partition
        Sweeper->>RevDB: Read sourcePartitionRevision (R_expected)
        Sweeper->>OccDB: Fetch active occurrences sorted by _id ASC
        Sweeper->>Sweeper: Calculate H_source = SHA256(canonicalTuples)
        Sweeper->>RepDB: findOne({ userId, targetDate })
        alt Report exists AND report.sourceManifestHash === H_source
            Sweeper->>Sweeper: Partition is clean (Skip)
        else Hash Mismatch OR Report Missing (Sweep Required)
            Sweeper->>Sweeper: Interval overlap detector: compute conflicts
            alt Mode A (Replica Set / Transaction)
                Sweeper->>RevDB: Inside session.withTransaction: verify partitionRevision === R_expected
                Sweeper->>RepDB: updateOne({ userId, targetDate }, { conflicts, sourcePartitionRevision: R_expected, status: "PENDING_CONFIRMATION" })
                Sweeper->>RevDB: set publishedReportRevision = R_expected
            else Mode B (Standalone Staged Revision Locking)
                Sweeper->>RevDB: findOneAndUpdate({ userId, dateStr, partitionRevision: R_expected }, { stagedSweepRevision: R_expected, sweepWorkerId: id, sweepLeaseExpiresAt: now + 5s })
                alt Lock Acquired (matchedCount === 1)
                    Sweeper->>RepDB: updateOne({ userId, targetDate }, { conflicts, sourcePartitionRevision: R_expected, status: "PENDING_CONFIRMATION" })
                    Sweeper->>RevDB: updateOne({ userId, dateStr }, { publishedReportRevision: R_expected, $unset: { sweepWorkerId: 1, stagedSweepRevision: 1 } })
                else Lock Failed (Source mutated mid-sweep)
                    Sweeper->>Sweeper: Partition mutated; abort cleanly without updating report
                end
            end
        end
    end
```

---

## 5. AUTONOMOUS DAEMON LIFECYCLE & TIMEZONE GUARD FLOW (LOOP 5)

```mermaid
flowchart TD
    StartDaemon["Daemon Tick: scripts/autonomous-worker-daemon.ts"] --> DiscoverUsers["Discover active users (Round-Robin, Max 5/tick)"]
    DiscoverUsers --> UserLoop["For each user:"]
    UserLoop --> AcquireUserLease{"Acquire Lease: userId:autonomous:daemon"}
    AcquireUserLease -->|Denied| SkipUser["Skip user this tick"]
    AcquireUserLease -->|Acquired| RunCategoryA["Execute Category A Tasks (DWCP Sweep, Schedule Sweep) under UTC Epoch"]

    RunCategoryA --> CheckTimezone{"Inspect user.settings.timezone"}
    CheckTimezone -->|Valid IANA String| RunCategoryB["Execute Category B Tasks: Quiet Hours, Daily Rollover, Briefing in User-Local Time"]
    CheckTimezone -->|Missing / Invalid String| DeferCategoryB["Log TIMEZONE_RESOLUTION_REQUIRED -> Suppress & Defer Category B Tasks (NO SILENT UTC)"]

    RunCategoryB --> HeartbeatLease{"Renew Lease Heartbeat with Fencing Token"}
    DeferCategoryB --> HeartbeatLease
    HeartbeatLease -->|Renewed| ReleaseUserLease["Release lease cleanly on tick completion"]
    HeartbeatLease -->|Preempted by Higher Epoch| HaltTick["Halt tick immediately; step down"]
```

---

## 6. EXECUTION GRAPH PROJECTION READ & REVISION SANDWICH REBUILD FLOW (LOOP 6)

```mermaid
sequenceDiagram
    autonumber
    actor Caller as UI Component / Task API
    participant Service as ExecutionGraphProjectionService
    participant DerivedDB as ExecutionGraphDerivedModel
    participant RevDB as UserGraphRevisionModel
    participant TaskDB as Task / Goal Models (Primary)

    Note over TaskDB,RevDB: All Task/Goal mutations atomically increment UserGraphRevision inside OutboxStorageService
    Caller->>Service: getGraph(userId)
    Service->>DerivedDB: findOne({ userId })
    alt Document Found
        Service->>RevDB: findOne({ userId }) [Lightweight Revision Lookup]
        alt derived.appliedGraphRevision === revision.graphRevision
            Note over Service,DerivedDB: ZERO queries to Task collection! Latency < 5ms
            Service-->>Caller: Return cached DAG projection (source: CACHE_HIT)
        else Revision Staleness Detected
            Note over Service: Execute Revision Sandwich Protocol
            Service->>RevDB: Step 1: Read R_start = revision.graphRevision
            Service->>TaskDB: Step 2: Fetch active Tasks & Goals for userId
            Service->>RevDB: Step 3: Read R_end = revision.graphRevision
            alt R_start !== R_end (Source mutation occurred during read window)
                Service->>Service: Abort rebuild and retry with fresh state
            else R_start === R_end = R (Snapshot consistent)
                Service->>Service: Build DAG, detect cycles, calculate unblocked tasks
                Service->>DerivedDB: updateOne({ userId, appliedGraphRevision: { $lt: R } }, { $set: { graph, appliedGraphRevision: R } })
                Service-->>Caller: Return rebuilt DAG projection (source: COLD_REBUILD)
            end
        end
    else Document Missing (Cold Start)
        Service->>RevDB: Read R_start
        Service->>TaskDB: Fetch active Tasks & Goals for userId
        Service->>RevDB: Read R_end
        alt R_start === R_end = R
            Service->>Service: Build DAG, detect cycles, calculate unblocked tasks
            Service->>DerivedDB: create({ userId, graph, appliedGraphRevision: R })
            Service-->>Caller: Return initial DAG projection (source: COLD_REBUILD)
        end
    end
```
