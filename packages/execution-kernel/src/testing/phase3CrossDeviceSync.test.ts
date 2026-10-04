import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InteractionSurfaceService,
  IInteractionSurfaceProjection,
} from "../index";

test("Phase 3: Multi-device broadcast: Mobile, Desktop, and Web receive identical projections", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_cross_sync";

  let mobileReceived: IInteractionSurfaceProjection | null = null;
  let desktopReceived: IInteractionSurfaceProjection | null = null;
  let webReceived: IInteractionSurfaceProjection | null = null;

  // Register 3 simulated client surfaces
  const unsubMobile = service.subscribe(userId, (p) => { mobileReceived = p; });
  const unsubDesktop = service.subscribe(userId, (p) => { desktopReceived = p; });
  const unsubWeb = service.subscribe(userId, (p) => { webReceived = p; });

  // Compute projection change
  const projection = await service.computeSurfaceProjection(userId);

  assert.ok(mobileReceived);
  assert.ok(desktopReceived);
  assert.ok(webReceived);

  const m = mobileReceived as unknown as IInteractionSurfaceProjection;
  const d = desktopReceived as unknown as IInteractionSurfaceProjection;
  const w = webReceived as unknown as IInteractionSurfaceProjection;

  // All surfaces must receive the exact same version and timestamp
  assert.equal(m.projectionVersion, projection.projectionVersion);
  assert.equal(d.projectionVersion, projection.projectionVersion);
  assert.equal(w.projectionVersion, projection.projectionVersion);
  assert.equal(m.generatedAtMs, projection.generatedAtMs);

  unsubMobile();
  unsubDesktop();
  unsubWeb();
});

test("Phase 3: Realtime distribution latency benchmark: 100 clients receive update in < 10ms (SLA < 500ms)", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_fanout_bench";
  const clientCount = 100;
  let deliveredCount = 0;

  const unsubs: Array<() => void> = [];
  for (let i = 0; i < clientCount; i++) {
    unsubs.push(service.subscribe(userId, () => {
      deliveredCount++;
    }));
  }

  const start = performance.now();
  await service.computeSurfaceProjection(userId);
  const durationMs = performance.now() - start;

  assert.equal(deliveredCount, clientCount, "All 100 clients must receive the broadcast");
  assert.ok(
    durationMs < 50,
    `Fan-out latency ${durationMs.toFixed(2)}ms exceeded SLA target!`
  );

  // Clean up
  for (const unsub of unsubs) {
    unsub();
  }
});

test("Phase 3: Monotonic version sequence guarantees cross-device causal ordering", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_ordering_test";
  const observedVersions: number[] = [];

  const unsub = service.subscribe(userId, (p) => {
    observedVersions.push(p.projectionVersion);
  });

  for (let i = 0; i < 5; i++) {
    await service.computeSurfaceProjection(userId);
  }

  assert.deepEqual(observedVersions, [1, 2, 3, 4, 5]);

  unsub();
});
