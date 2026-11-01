# LIFEOS — STEP 3 APPLICATION CONNECTIVITY MAP
## Network Topology, Transport Bridges, Web Locks Coordination & SWR Rehydration
**Milestone:** Step 3 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Specification  
**Authority:** The Executioners (ExE)  
**Status:** RECONCILED & TOPOLOGICALLY ACCURATE  

---

## 1. END-TO-END APPLICATION CONNECTIVITY TOPOLOGY

The application delivery tier bridges the sovereign kernel, MongoDB persistence, and diverse user runtimes with zero external broker daemons:

```mermaid
flowchart TD
    subgraph Client_Runtimes [Client Runtimes]
        subgraph Browser_Origin [Web Browser Origin]
            TabLeader["Tab 1 (Leader - Web Lock)"]
            TabFollower["Tab 2 (Follower - Degraded)"]
            BC["BroadcastChannel ('lifeos_runtime_sync')"]
            TabLeader <-->|Post Invalidation / Heartbeat| BC
            BC <-->|Listen Invalidation| TabFollower
        end
        MobileClient["React Native Mobile (XMLHttpRequest Streaming)"]
        DesktopTray["Tauri Desktop (DesktopSurfaceManager.ts)"]
    end

    subgraph Edge_Infrastructure [Edge & Ingress Infrastructure]
        ReverseProxy["Reverse Proxy (Nginx / Cloudflare)"]
        ReverseProxy -->|X-Accel-Buffering: no | BufferFlush[1KB Initial Comment Padding]
    end

    subgraph Node_Standalone [Standalone Next.js Server (apps/web/server.js)]
        SSERoute["SSE Route Handler (/api/surface/events)"]
        AuthMiddleware["Auth & Session Revocation Barrier"]
        StreamRegistry["Active Connection Stream Registry"]
        SSERoute --> AuthMiddleware
        AuthMiddleware --> StreamRegistry
    end

    subgraph Kernel_Delivery_Engine [Kernel & Delivery Engine]
        Dispatcher["DurableOutboxDispatcher (Step 2)"]
        Gate["PublicationEligibilityGate (Step 3 Loop 2)"]
        Sequencer["User Delivery Sequencer (Step 3 Loop 3)"]
        Journal["UserDeliveryJournalModel (MongoDB)"]
        Dispatcher --> Gate
        Gate --> Sequencer
        Sequencer --> Journal
        Journal -->|Push Monotonic Frames| StreamRegistry
    end

    TabLeader -->|Cookie Auth| ReverseProxy
    MobileClient -->|Bearer JWT Header| ReverseProxy
    DesktopTray -->|Localhost / IPC| ReverseProxy
    ReverseProxy --> SSERoute
```

---

## 2. MUTATION-TO-REHYDRATION SEQUENCE FLOW

This flow demonstrates an end-to-end task completion mutation initiated from the web interface, showing how optimistic UI state, outbox processing, projection convergence, and client SWR cache rehydration coordinate seamlessly:

```mermaid
sequenceDiagram
    participant User as User / UI DOM
    participant SWR as Client SWR Cache
    participant API as Next.js API (/api/tasks/complete)
    participant Kernel as ExecutionKernel / TaskAggregate
    participant Outbox as OutboxEventModel
    participant Dispatcher as DurableOutboxDispatcher
    participant Consumer as ExecutionGraphConsumer (Step 2)
    participant Ledger as ConsumerProcessingLedgerModel
    participant Gate as PublicationEligibilityGate
    participant Sequencer as UserDeliverySequencer (Leased)
    participant Journal as UserDeliveryJournalModel
    participant SSE as Standalone SSE Handler
    participant BC as BroadcastChannel
    participant Tab2 as Follower Tab

    User->>SWR: Click "Complete Task"
    SWR->>User: Optimistic UI Update (Strikethrough Task)
    SWR->>API: POST /api/tasks/complete { taskId }
    API->>Kernel: dispatch(CompleteTaskCommand)
    Kernel->>Outbox: Commit Task Aggregate & Insert OutboxEvent (PENDING)
    API-->>SWR: HTTP 200 { success: true }

    Dispatcher->>Outbox: Lease Event (deliveryStatus: "PROCESSING")
    Dispatcher->>Consumer: process(envelope, leaseGen)
    Consumer->>Consumer: Update ExecutionGraphDerivedModel
    Consumer->>Ledger: Insert Ledger (status: "SUCCEEDED")
    Dispatcher->>Outbox: acknowledgeCompletion() -> status: "DELIVERED"

    Dispatcher->>Gate: isEligibleForPublication(event)
    Gate->>Ledger: Assert Consumer SUCCEEDED
    Gate-->>Sequencer: Gate Cleared

    Sequencer->>Sequencer: Acquire Lease "user_delivery:userId"
    Sequencer->>Journal: Assign deliverySeq (e.g. 105) & Persist (COMMITTED)
    Sequencer->>SSE: Emit Invalidation Frame (deliverySeq: 105, tags: ["tasks", "dashboard"])
    Sequencer->>Journal: Update Status -> "PUBLISHED"

    SSE->>SWR: onmessage: { deliverySeq: 105, tags: ["tasks", "dashboard"] }
    SWR->>BC: postMessage({ deliverySeq: 105, tags: ["tasks"] })
    BC->>Tab2: Receive Invalidation -> SWR mutate("tasks")
    SWR->>SWR: mutate("tasks") -> Fetch Projection Truth
    SWR-->>User: Rehydrate UI DOM (Confirmed Authoritative State)
```

---

## 3. MULTI-TAB WEB LOCKS PROTOCOL & FOLLOWER DEGRADED MODE

To conserve server resources and maintain local origin synchronization, multiple open browser tabs coordinate via the W3C Web Locks API:

```mermaid
sequenceDiagram
    participant TabA as Tab A (Leader Candidate)
    participant TabB as Tab B (Follower Candidate)
    participant WL as W3C Web Locks API
    participant BC as BroadcastChannel ("lifeos_runtime_sync")
    participant SSE as Server /api/surface/events

    TabA->>WL: request("lifeos_sse_stream_lock", { ifAvailable: true })
    WL-->>TabA: Lock Granted (Tab A is Leader)
    TabA->>SSE: Open Persistent EventSource Connection
    SSE-->>TabA: Connected (Seq_conn: 1, deliverySeq: 100)

    TabB->>WL: request("lifeos_sse_stream_lock", { ifAvailable: true })
    WL-->>TabB: Lock Denied (Held by Tab A)
    TabB->>BC: Subscribe to BroadcastChannel

    loop Every 5 Seconds
        TabA->>BC: postMessage({ type: "HEARTBEAT", timestamp: Date.now() })
    end

    Note over TabA: Tab A Suspended / Minimized by OS Energy Saver
    Note over TabB: Tab B observes > 15s without Broadcast Heartbeat
    TabB->>TabB: Enter Follower Degraded Mode (Local SWR Polling)
    Note over TabB: Tab B does NOT attempt to forcefully steal lock
    TabB->>WL: Non-blocking re-check: request({ ifAvailable: true })
    Note over TabA: Tab A Closed / Navigated Away -> Browser frees lock
    WL-->>TabB: Lock Granted (Tab B ascends to Leader)
    TabB->>SSE: Open Persistent EventSource Connection (Last-Event-ID: 100)
```

---

## 4. CROSS-SURFACE CLIENT CAPABILITIES MATRIX

| Surface | Client Technology | Authentication | Stream Protocol | Invalidation Strategy | Fallback / Reconnect Behavior |
|---|---|---|---|---|---|
| **Web Browser** | Next.js 16 / React 19 SWR | Same-origin cookie (`next-auth.session-token`) | `EventSource` | Web Locks Leader + `BroadcastChannel` distribution | Exponential backoff ($1\text{s} \dots 30\text{s}$); Follower Degraded Mode |
| **Native Mobile** | React Native (Expo) | `Authorization: Bearer <mobileJwt>` | `XMLHttpRequest` (readyState 3 / LOADING) | Direct SWR / Query Invalidation | Exponential backoff ($1\text{s} \dots 30\text{s}$); Background fetch |
| **Desktop Tray** | Tauri 2.4 / Rust Core | Localhost cookie / Tauri IPC | `EventSource` / IPC | Updates Tray icon & Spotlight HUD (<100ms) | Automatic reconnection via `DesktopSurfaceManager.ts` |
