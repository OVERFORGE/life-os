/**
 * TabSyncCoordinator.ts
 * 
 * LifeOS Step 3 V2.2 — Application Delivery Integration
 * Browser runtime multi-tab synchronization and single-socket coordinator.
 * Uses W3C Web Locks API (navigator.locks) for non-preemptive leader election
 * and BroadcastChannel for cross-tab invalidation distribution.
 * Implements Follower Degraded Mode upon leader suspension.
 */

export type TabRole = "LEADER" | "FOLLOWER" | "DEGRADED_FOLLOWER" | "STANDALONE";
export type InvalidationCallback = (tags: string[], deliverySeq: number) => void;
export type ResyncCallback = () => void;

export interface TabSyncOptions {
  channelName?: string;
  lockName?: string;
  heartbeatIntervalMs?: number;
  leaderTimeoutMs?: number;
  customLocks?: any;
  customBroadcastChannel?: any;
}

export class TabSyncCoordinator {
  private static instance: TabSyncCoordinator;

  public readonly CHANNEL_NAME = "lifeos_runtime_sync";
  public readonly LOCK_NAME = "lifeos_sse_stream_lock";
  public readonly HEARTBEAT_INTERVAL_MS = 5000;
  public readonly LEADER_TIMEOUT_MS = 15000;
  private leaderTimeoutMs: number = 15000;

  private role: TabRole = "FOLLOWER";
  private broadcastChannel: any = null;
  private locks: any = null;
  private isDestroyed = false;

  private heartbeatTimer: any = null;
  private leaderWatchdogTimer: any = null;
  private lockRecheckTimer: any = null;
  private lastLeaderHeartbeat = 0;

  private leaderLockResolver?: () => void;

  private invalidationListeners: Set<InvalidationCallback> = new Set();
  private resyncListeners: Set<ResyncCallback> = new Set();

  private onLeaderElectedCallback?: () => void;
  private onFollowerDegradedCallback?: () => void;

  constructor(options?: TabSyncOptions) {
    this.leaderTimeoutMs = options?.leaderTimeoutMs || this.LEADER_TIMEOUT_MS;
    this.locks = options?.customLocks || (typeof window !== "undefined" ? window.navigator?.locks : null);
    
    const BC = options?.customBroadcastChannel || (typeof window !== "undefined" ? (window as any).BroadcastChannel : null);
    if (BC) {
      if (typeof BC === "function") {
        try {
          this.broadcastChannel = new BC(options?.channelName || this.CHANNEL_NAME);
        } catch {
          this.broadcastChannel = BC;
        }
      } else {
        this.broadcastChannel = BC;
      }
    }

    this.initBroadcastListeners();
  }

  public static getInstance(options?: TabSyncOptions): TabSyncCoordinator {
    if (!TabSyncCoordinator.instance) {
      TabSyncCoordinator.instance = new TabSyncCoordinator(options);
    }
    return TabSyncCoordinator.instance;
  }

  public static resetInstance(): void {
    if (TabSyncCoordinator.instance) {
      TabSyncCoordinator.instance.destroy();
      TabSyncCoordinator.instance = undefined as any;
    }
  }

  /**
   * Initializes Web Locks leader election and cross-tab communication.
   */
  public async initialize(callbacks?: {
    onLeaderElected?: () => void;
    onFollowerDegraded?: () => void;
  }): Promise<void> {
    this.isDestroyed = false;
    this.onLeaderElectedCallback = callbacks?.onLeaderElected;
    this.onFollowerDegradedCallback = callbacks?.onFollowerDegraded;

    if (!this.locks) {
      // Non-browser or environments lacking Web Locks API run in STANDALONE mode
      this.role = "STANDALONE";
      this.onLeaderElectedCallback?.();
      return;
    }

    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      this.attemptLockAcquisition(done);
      setTimeout(done, 50);
    });
  }

  /**
   * Non-preemptive lock request with { ifAvailable: true }.
   * Strictly adheres to Rule 8 (Zero Lock Breaking).
   */
  private attemptLockAcquisition(onAttemptComplete?: () => void): void {
    if (this.isDestroyed || !this.locks) {
      onAttemptComplete?.();
      return;
    }

    try {
      this.locks.request(
        this.LOCK_NAME,
        { ifAvailable: true },
        async (lock: any) => {
          if (!lock) {
            // Lock held by another tab -> become Follower
            this.transitionToFollower();
            onAttemptComplete?.();
            return;
          }

          // Lock acquired -> become Leader
          this.role = "LEADER";
          this.clearFollowerTimers();
          this.onLeaderElectedCallback?.();
          this.broadcastHeartbeat();
          this.heartbeatTimer = setInterval(() => {
            this.broadcastHeartbeat();
          }, this.HEARTBEAT_INTERVAL_MS);

          onAttemptComplete?.();

          return new Promise<void>((resolve) => {
            this.leaderLockResolver = resolve;
          });
        }
      ).catch((err: any) => {
        console.warn("[TabSyncCoordinator] Web Lock acquisition notice:", err);
        this.transitionToFollower();
        onAttemptComplete?.();
      });
    } catch (err) {
      console.warn("[TabSyncCoordinator] Web Lock acquisition notice:", err);
      this.transitionToFollower();
      onAttemptComplete?.();
    }
  }

  private transitionToFollower(): void {
    this.role = "FOLLOWER";
    this.lastLeaderHeartbeat = Date.now();
    this.startLeaderWatchdog();

    // Periodically re-check if lock is available without polling aggressively
    if (!this.lockRecheckTimer) {
      this.lockRecheckTimer = setInterval(() => {
        if (this.role === "FOLLOWER" || this.role === "DEGRADED_FOLLOWER") {
          this.attemptLockAcquisition();
        }
      }, 10000);
    }
  }

  private startLeaderWatchdog(): void {
    if (this.leaderWatchdogTimer) clearInterval(this.leaderWatchdogTimer);

    const checkInterval = Math.max(20, Math.min(5000, Math.floor(this.leaderTimeoutMs / 2)));
    this.leaderWatchdogTimer = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastLeaderHeartbeat;
      if (timeSinceLastHeartbeat > this.leaderTimeoutMs) {
        // Leader tab is suspended, throttled, or closed without releasing lock
        if (this.role !== "DEGRADED_FOLLOWER") {
          this.role = "DEGRADED_FOLLOWER";
          this.onFollowerDegradedCallback?.();
        }
      }
    }, checkInterval);
  }

  private broadcastHeartbeat(): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: "LEADER_HEARTBEAT",
          timestamp: Date.now(),
        });
      } catch {}
    }
  }

  private initBroadcastListeners(): void {
    if (!this.broadcastChannel) return;

    this.broadcastChannel.onmessage = (event: any) => {
      const msg = event?.data;
      if (!msg) return;

      if (msg.type === "LEADER_HEARTBEAT") {
        this.lastLeaderHeartbeat = Date.now();
        if (this.role === "DEGRADED_FOLLOWER") {
          this.role = "FOLLOWER";
        }
      } else if (msg.type === "INVALIDATE") {
        for (const listener of this.invalidationListeners) {
          listener(msg.tags || [], msg.deliverySeq || 0);
        }
      } else if (msg.type === "RESYNC_REQUIRED") {
        for (const listener of this.resyncListeners) {
          listener();
        }
      }
    };
  }

  /**
   * Broadcasts an invalidation message from Leader to Follower tabs.
   */
  public broadcastInvalidation(tags: string[], deliverySeq: number): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: "INVALIDATE",
          tags,
          deliverySeq,
          timestamp: Date.now(),
        });
      } catch {}
    }
    // Also invoke local listeners on Leader tab
    for (const listener of this.invalidationListeners) {
      listener(tags, deliverySeq);
    }
  }

  /**
   * Broadcasts a resync directive across all tabs.
   */
  public broadcastResync(): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: "RESYNC_REQUIRED",
          timestamp: Date.now(),
        });
      } catch {}
    }
    for (const listener of this.resyncListeners) {
      listener();
    }
  }

  public onInvalidation(cb: InvalidationCallback): () => void {
    this.invalidationListeners.add(cb);
    return () => this.invalidationListeners.delete(cb);
  }

  public onResync(cb: ResyncCallback): () => void {
    this.resyncListeners.add(cb);
    return () => this.resyncListeners.delete(cb);
  }

  public getRole(): TabRole {
    return this.role;
  }

  public isLeader(): boolean {
    return this.role === "LEADER" || this.role === "STANDALONE";
  }

  public isDegraded(): boolean {
    return this.role === "DEGRADED_FOLLOWER";
  }

  private clearFollowerTimers(): void {
    if (this.leaderWatchdogTimer) {
      clearInterval(this.leaderWatchdogTimer);
      this.leaderWatchdogTimer = null;
    }
    if (this.lockRecheckTimer) {
      clearInterval(this.lockRecheckTimer);
      this.lockRecheckTimer = null;
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.clearFollowerTimers();
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.leaderLockResolver) {
      this.leaderLockResolver();
      this.leaderLockResolver = undefined;
    }
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {}
      this.broadcastChannel = null;
    }
    this.invalidationListeners.clear();
    this.resyncListeners.clear();
  }
}
