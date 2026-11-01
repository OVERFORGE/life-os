import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TabSyncCoordinator } from "../../../../../apps/web/features/runtime/services/TabSyncCoordinator";

describe("Step 3 Loop 5: Web Client Reactive Layer & Web Locks Coordination", () => {
  // Mock BroadcastChannel factory
  function createMockBroadcastChannel() {
    const channels = new Map<string, Set<any>>();

    return class MockBroadcastChannel {
      public name: string;
      public onmessage: ((ev: any) => void) | null = null;
      private isClosed = false;

      constructor(name: string) {
        this.name = name;
        if (!channels.has(name)) {
          channels.set(name, new Set());
        }
        channels.get(name)!.add(this);
      }

      public postMessage(data: any): void {
        if (this.isClosed) return;
        const group = channels.get(this.name);
        if (group) {
          for (const member of group) {
            if (member !== this && member.onmessage) {
              member.onmessage({ data });
            }
          }
        }
      }

      public close(): void {
        this.isClosed = true;
        channels.get(this.name)?.delete(this);
      }
    };
  }

  // Mock Web Locks API
  function createMockLocks() {
    let currentHolder: string | null = null;

    return {
      request: async (name: string, options: any, callback: any) => {
        if (options.ifAvailable) {
          if (currentHolder !== null && currentHolder !== name) {
            // Lock busy
            return callback(null);
          }
          currentHolder = name;
          try {
            return await callback({ name });
          } finally {
            currentHolder = null;
          }
        }
        return callback({ name });
      },
    };
  }

  it("first tab must acquire lock and become LEADER", async () => {
    const MockBC = createMockBroadcastChannel();
    const mockLocks = createMockLocks();

    const coordinator = new TabSyncCoordinator({
      customLocks: mockLocks,
      customBroadcastChannel: MockBC,
    });

    let leaderElected = false;
    await coordinator.initialize({
      onLeaderElected: () => {
        leaderElected = true;
      },
    });

    assert.equal(coordinator.isLeader(), true);
    assert.equal(coordinator.getRole(), "LEADER");
    assert.equal(leaderElected, true);

    coordinator.destroy();
  });

  it("follower tab must receive broadcast invalidations from leader tab", async () => {
    const MockBC = createMockBroadcastChannel();

    // Leader coordinator
    const leaderCoordinator = new TabSyncCoordinator({
      customLocks: null, // Standalone mode acts as leader
      customBroadcastChannel: MockBC,
    });

    // Follower coordinator
    const followerCoordinator = new TabSyncCoordinator({
      customLocks: {
        request: async (_name: any, _opts: any, cb: any) => cb(null), // Lock denied
      },
      customBroadcastChannel: MockBC,
    });

    await leaderCoordinator.initialize();
    await followerCoordinator.initialize();

    assert.equal(leaderCoordinator.isLeader(), true);
    assert.equal(followerCoordinator.isLeader(), false);
    assert.equal(followerCoordinator.getRole(), "FOLLOWER");

    const receivedTags: string[][] = [];
    followerCoordinator.onInvalidation((tags, seq) => {
      receivedTags.push(tags);
      assert.equal(seq, 108);
    });

    // Leader broadcasts invalidation
    leaderCoordinator.broadcastInvalidation(["tasks", "dashboard"], 108);

    assert.equal(receivedTags.length, 1);
    assert.deepEqual(receivedTags[0], ["tasks", "dashboard"]);

    leaderCoordinator.destroy();
    followerCoordinator.destroy();
  });

  it("follower tab must transition to DEGRADED_FOLLOWER if leader heartbeat stops", async () => {
    const MockBC = createMockBroadcastChannel();

    const followerCoordinator = new TabSyncCoordinator({
      customLocks: {
        request: async (_name: any, _opts: any, cb: any) => cb(null), // Lock denied
      },
      customBroadcastChannel: MockBC,
      leaderTimeoutMs: 50, // Short timeout for testing
    });

    let becameDegraded = false;
    await followerCoordinator.initialize({
      onFollowerDegraded: () => {
        becameDegraded = true;
      },
    });

    assert.equal(followerCoordinator.getRole(), "FOLLOWER");

    // Wait for leader timeout (80ms > 50ms)
    await new Promise((r) => setTimeout(r, 80));

    // Force watchdog check by setting lastLeaderHeartbeat in the past
    (followerCoordinator as any).lastLeaderHeartbeat = Date.now() - 100;
    (followerCoordinator as any).startLeaderWatchdog();

    // Verify degraded state
    assert.ok(followerCoordinator.isDegraded() || becameDegraded);

    followerCoordinator.destroy();
  });
});
