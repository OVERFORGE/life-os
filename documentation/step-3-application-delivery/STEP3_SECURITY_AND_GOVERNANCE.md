# LIFEOS — STEP 3 SECURITY & GOVERNANCE SPECIFICATION
## Authentication, Sockets Governance, Web Locks & Multi-Surface Compensation
**Milestone:** Step 3 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Specification  
**Authority:** The Executioners (ExE)  
**Status:** RECONCILED & CODE-VERIFIED  

---

## 1. CLIENT AUTHENTICATION & TRANSPORT REALITY

Authentication mechanisms differ fundamentally across browser, native mobile, and desktop environments. The delivery runtime implements tailored, zero-trust authentication per transport boundary without exposing tokens in URL query strings:

```
+───────────────────+───────────────────────────────────+──────────────────────────────────────────────────────+
| Client Runtime    | Transport Protocol                | Authentication Credential & Verification Path        |
+───────────────────+───────────────────────────────────+──────────────────────────────────────────────────────+
| Web Browser       | W3C EventSource                   | Same-origin NextAuth session cookie (JWE).            |
|                   | (/api/surface/events)             | Server: getServerSession(authOptions).               |
|                   |                                   | Query tokens (?token=...) are strictly prohibited.   |
+───────────────────+───────────────────────────────────+──────────────────────────────────────────────────────+
| Native Mobile     | XMLHttpRequest Streaming          | Authorization: Bearer <mobileJwt> (Header).          |
| (React Native)    | (readyState 3 / LOADING)          | Server: jwt.verify(token, secret) +                  |
|                   |                                   | MongoDB check: Session.isRevoked == false.           |
+───────────────────+───────────────────────────────────+──────────────────────────────────────────────────────+
| Desktop (Tauri)   | Tauri IPC / Local EventSource     | Shared same-origin localhost session cookie or       |
|                   | (DesktopSurfaceManager.ts)        | isolated loopback Bearer token.                      |
+───────────────────+───────────────────────────────────+──────────────────────────────────────────────────────+
```

### 1.1 Web Browser Session Authentication
- **Mechanism**: The W3C `EventSource` standard does not support custom HTTP request headers. Browser clients authenticate via same-origin cookies (`next-auth.session-token`).
- **Server Verification**: The Next.js route handler calls `getAuthSession()` from [`apps/web/lib/auth.ts`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/lib/auth.ts), invoking NextAuth's `getServerSession(authOptions)`.
- **Cryptographic Model**: NextAuth session cookies use JSON Web Encryption (JWE) with AES-GCM encryption. They are **not** ordinary signed JWTs and cannot be decoded or verified with standard `jwt.verify()`.
- **URL Token Ban**: Under no circumstances may authentication tokens be passed as query string parameters (`/api/surface/events?token=...`). Query parameters are logged in plaintext across intermediate proxies, browser histories, and server access logs.

### 1.2 Native Mobile Authentication & Revocation
- **Token Issuance**: Handled by [`apps/web/app/api/mobile-auth/route.ts`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/app/api/mobile-auth/route.ts). Issues an HMAC-SHA256 signed JWT (`jwt.sign`) using `process.env.NEXTAUTH_SECRET` with an expiration of 30 days.
- **Payload Schema**:
  ```typescript
  interface MobileTokenPayload {
    id: string; // dbUser._id.toString()
    email: string;
    name: string;
    sessionId: string; // crypto.randomUUID()
    iat: number;
    exp: number;
  }
  ```
- **Active Revocation Enforcement**:
  Every mobile request validated by `getAuthSession()` extracts the `sessionId` and asserts against MongoDB:
  ```typescript
  const sessionRecord = await Session.findOne({
    sessionToken: decoded.sessionId,
    isRevoked: true
  }).lean();
  if (sessionRecord) return null; // Reject immediately
  ```
- **Repository Finding & Correction**:
  While [`apps/mobile/utils/api.ts`](file:///d:/PROGRAMMING/Projects/life-os/apps/mobile/utils/api.ts) (`fetchWithAuth`) retrieves `AsyncStorage.getItem('user_token')` and attaches the `Authorization: Bearer` header, [`InteractionEventTransport.ts`](file:///d:/PROGRAMMING/Projects/life-os/apps/mobile/services/InteractionEventTransport.ts) currently omits this header during `xhr.open()`. In Step 3 Loop 4, `InteractionEventTransport.ts` will be updated to attach the bearer token prior to stream initiation.

### 1.3 Desktop Surface Security
- **Integration**: [`apps/desktop/src/services/DesktopSurfaceManager.ts`](file:///d:/PROGRAMMING/Projects/life-os/apps/desktop/src/services/DesktopSurfaceManager.ts) connects to `/api/surface/events`.
- **Boundary**: In desktop Tauri builds, the frontend webview communicates with the Rust backend via Tauri IPC (`invoke("update_tray_status")`). In dev/standalone modes, it relies on localhost cookies or bearer tokens stored in the OS credential vault.

---

## 2. HOSTING TOPOLOGY & PROCESS MODEL

### 2.1 Standalone Node.js Container Deployment
- [`apps/web/next.config.ts`](file:///d:/PROGRAMMING/Projects/life-os/apps/web/next.config.ts) defines `output: "standalone"`.
- Next.js builds produce a self-contained Node.js HTTP server (`apps/web/server.js`) rather than serverless or edge lambda functions.
- Long-lived persistent SSE TCP sockets are natively supported without arbitrary 30-second serverless execution timeouts.

### 2.2 Reverse Proxy & Intermediate Buffering Bypass
Reverse proxies (Nginx, Cloudflare, Traefik) buffer chunked HTTP responses by default, which delays real-time SSE frames. The delivery route enforces three anti-buffering safeguards:
1. **Header Suppression**: Transmits `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform`.
2. **Initial Comment Flush Padding**: Upon socket connection, the server immediately enqueues a 1024-byte comment block (`: LifeOS SSE Connection Established [padding ...]\n\n`). This immediately saturates intermediate 1KB proxy buffers and initiates chunked streaming mode.
3. **Keep-Alive Heartbeats**: Server emits `: ping\n\n` every **15 seconds** to prevent reverse proxy idle read timeouts ($\ge 60\text{s}$).

### 2.3 Multi-Instance Deployment Verification Conditions
In a distributed multi-container deployment behind a load balancer:
- Client SSE connections terminate on specific Node.js container instances.
- Outbox processing or mutations may occur on a different container instance.
- **Pre-Production Boundary**: In-process event emitters (`InteractionSurfaceService.getInstance()`) only broadcast to connections on the *local* container. For multi-instance broadcasting, instances must listen to MongoDB Change Streams on `UserDeliveryJournalModel` (or configure sticky sessions). The single-instance deployment model is the verified baseline; multi-instance change stream synchronization is documented as a deployment condition.

---

## 3. AUTHORITATIVE CONNECTION GOVERNANCE

All conflicting parameters across historical planning versions are reconciled into one authoritative policy:

| Parameter | Authoritative Value | Scope | Rationale / Constraint |
|---|---|---|---|
| **Max Streams per User** | **3 streams** | Process-Local | 1 Web Leader + 1 Mobile Device + 1 Desktop Tray |
| **Global Stream Ceiling** | **5 streams** | Multi-Instance | Enforced via active session registry across all instances |
| **Process Socket Capacity** | **500 sockets** | Process-Local | Constrains heap overhead to $< 300\text{MB}$ per Node process |
| **Max Replay Buffer** | **50 frames** | Per-User Journal | Retains $\approx 25\text{KB}$ per user; covers transient disconnects ($\le 15\text{s}$) |
| **Server Heartbeat Interval** | **15 seconds** | Sockets | Matches `apps/web/app/api/surface/events/route.ts` |
| **Client Timeout Threshold** | **30 seconds** | Client Runtime | Triggers reconnect after 2 consecutive missed heartbeats |
| **Reconnection Rate Limit** | **10 req / min** | Per Client IP | Prevents reconnect storms; tracked via verified proxy IP |
| **Slow Consumer Threshold** | **50 frames** | Socket Buffer | Terminate socket if backpressure persists $> 10\text{s}$ |
| **Backoff Schedule** | $1\text{s} \dots 30\text{s}$ | Client Runtime | Exponential backoff ($1\text{s}, 2\text{s}, 4\text{s}, 8\text{s}, 16\text{s}, 30\text{s}$) with $\pm 20\%$ jitter |

---

## 4. MULTI-TAB WEB LOCKS & FOLLOWER DEGRADED MODE

### 4.1 Safe Web Locks Protocol
To prevent multi-tab connection exhaustion, web clients coordinate via the W3C Web Locks API:
1. Every tab attempts non-blocking lock acquisition:
   ```typescript
   navigator.locks.request("lifeos_sse_stream_lock", { ifAvailable: true }, async (lock) => {
     if (!lock) {
       // Lock is held by another tab; transition to Follower Mode
       initiateFollowerMode();
       return;
     }
     // Lock acquired; operate as Leader
     await runLeaderStream();
   });
   ```
2. **Leader Responsibility**: The leader tab opens the single SSE stream and rebroadcasts received invalidations to follower tabs using `BroadcastChannel("lifeos_runtime_sync")`.
3. **Lock Release**: When the leader tab navigates away or closes, the browser automatically releases the lock. A follower tab acquires the lock on its next check.

### 4.2 Follower Degraded Mode (Zero Lock Breaking)
The W3C Web Locks API does not allow forceful preemption. Attempting to abort or steal another tab's lock causes unhandled runtime exceptions.
- **Degraded Trigger**: If a leader tab is suspended or throttled by operating system energy saver, `BroadcastChannel` pings cease.
- If no broadcast heartbeat is observed for **15 seconds**, follower tabs enter **Follower Degraded Mode**:
  1. Followers do **not** attempt to steal or break the Web Lock.
  2. Followers initiate local on-demand SWR revalidation whenever the tab is focused or receives user interaction.
  3. Followers periodically re-test `{ ifAvailable: true }`. When the browser frees the lock, a follower seamlessly ascends to Leader.

---

## 5. TWO-LAYER HUMAN-IN-THE-LOOP GOVERNANCE & REVERSAL

The LifeOS governance architecture cleanly separates transient UI affordances from durable kernel transaction guarantees:

```
+───────────────────────────────────────────────────────────────────────────────────+
| CLIENT SURFACE LAYER: Ambient Countdown Toast                                      |
| • Duration: 15 seconds (transient visual affordance).                             |
| • Purpose: Immediate user cancellation of newly initiated actions.                 |
| • Mechanism: Displays countdown toast; if user clicks "Undo", dispatches abort.    |
+───────────────────────────────────────────────────────────────────────────────────+
                                          │
                                          ▼
+───────────────────────────────────────────────────────────────────────────────────+
| KERNEL TRANSACTION LAYER: Authoritative Compensation Window                        |
| • Duration: 24 Hours (Authoritative Retention Window).                            |
| • Enforcement: AutonomousActionReverser.ts & AutonomousExecutionLedgerModel.     |
| • Contract: Reversal accepted if (Date.now() - executedAt) <= 86,400,000ms.      |
| • Delivery Boundary: SSE stream surfaces PENDING_CONFIRMATION proposals only;     |
|   the delivery tier NEVER authorizes or executes reversible actions directly.    |
+───────────────────────────────────────────────────────────────────────────────────+
```
