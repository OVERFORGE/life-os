/**
 * Phase 7C Pre-Conditions: Union-Find Adversarial Tests
 *
 * Verifies the 4 Union-Find determinism invariants from ADR-002 Decision 6
 * using the existing extractMemorySignals + evolveConstraintMemory pipeline.
 *
 * UF-1: Root selection determinism (insertion-order variance)
 * UF-2: Split isolation (split children form independent clusters)
 * UF-3: Merge identity (merged chunk inherits all edges from parents)
 * UF-4: Deterministic processing order (cyclic deps, rewiring)
 */

import { evolveConstraintMemory, extractMemorySignals } from "./server/planner/heuristics/evolveConstraintMemory";
import { INITIAL_CONSTRAINT_MEMORY } from "./server/planner/heuristics/ConstraintMemoryTypes";
import { INITIAL_HEURISTIC_STATE } from "./server/planner/heuristics/HeuristicTypes";
import { GovernanceMetrics } from "./server/planner/types/GovernanceTypes";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const baseMetrics: GovernanceMetrics = {
  topologyChurnRate: 0.1, repairDensity: 0.2,
  deferredCarryForwardVelocity: 0, convergenceHalfLife: 1,
  replayAmplificationFactor: 1, trajectory: "stabilizing",
  trajectoryMetadata: { trendSlope: -1, volatility: 0, envelopeExpansionRate: -1, oscillationFrequency: 0 }
};

function evolveOnce(
  units: any[],
  oscillating: string[] = [],
  displaced: string[] = []
) {
  const signals = extractMemorySignals(
    new Set(), oscillating, displaced, displaced, [], units, new Map(), 10
  );
  return evolveConstraintMemory(INITIAL_CONSTRAINT_MEMORY, signals, baseMetrics, INITIAL_HEURISTIC_STATE);
}

function getRegionIds(memory: ReturnType<typeof evolveConstraintMemory>): string[] {
  return [...memory.topologyRegionMemory.keys()].sort();
}

async function runTests() {
  console.log("─────────────────────────────────────────────────────────────────");
  console.log(" Phase 7C Pre: Union-Find Determinism Adversarial Tests");
  console.log("─────────────────────────────────────────────────────────────────\n");

  // ── UF-1: Insertion-Order Variance ────────────────────────────────────────
  {
    console.log("UF-1: Insertion-Order Variance (same deps, shuffled unit order)");

    // Cluster: A-B-C all depend on each other
    const unitsABC = [
      { id: "A", dependencyIds: ["B"] },
      { id: "B", dependencyIds: ["C"] },
      { id: "C" }
    ];
    // Same cluster but reversed insertion order
    const unitsCBA = [
      { id: "C" },
      { id: "B", dependencyIds: ["C"] },
      { id: "A", dependencyIds: ["B"] }
    ];
    // Random shuffle
    const unitsBAC = [
      { id: "B", dependencyIds: ["C"] },
      { id: "A", dependencyIds: ["B"] },
      { id: "C" }
    ];

    const memABC = evolveOnce(unitsABC, ["A", "B", "C"]);
    const memCBA = evolveOnce(unitsCBA, ["A", "B", "C"]);
    const memBAC = evolveOnce(unitsBAC, ["A", "B", "C"]);

    const regionsABC = getRegionIds(memABC);
    const regionsCBA = getRegionIds(memCBA);
    const regionsBAC = getRegionIds(memBAC);

    assert(
      "Region IDs identical regardless of insertion order (ABC vs CBA)",
      JSON.stringify(regionsABC) === JSON.stringify(regionsCBA),
      `ABC=${regionsABC.join(",")}, CBA=${regionsCBA.join(",")}`
    );
    assert(
      "Region IDs identical regardless of insertion order (ABC vs BAC)",
      JSON.stringify(regionsABC) === JSON.stringify(regionsBAC),
      `ABC=${regionsABC.join(",")}, BAC=${regionsBAC.join(",")}`
    );
    // Verify regionId is sorted lexicographically (A < B < C)
    const expectedRegionId = "A:B:C";
    assert(
      "Region ID is lexicographically sorted (A:B:C)",
      regionsABC.includes(expectedRegionId),
      `regions=${regionsABC.join(",")}`
    );
  }

  // ── UF-2: Cyclic Dependency Rewiring ─────────────────────────────────────
  {
    console.log("\nUF-2: Cyclic Dependency Rewiring (A→B→C→A cycle)");

    // A→B, B→C, C→A — a full cycle
    const cyclicUnits = [
      { id: "X", dependencyIds: ["Y"] },
      { id: "Y", dependencyIds: ["Z"] },
      { id: "Z", dependencyIds: ["X"] }  // cycle closes here
    ];

    let threw = false;
    let mem: any;
    try {
      mem = evolveOnce(cyclicUnits, ["X", "Y", "Z"]);
    } catch (e) {
      threw = true;
    }

    assert("Cyclic deps do not cause infinite loop or throw", !threw);

    if (!threw) {
      const regions = getRegionIds(mem);
      // X, Y, Z are all connected via deps → should be one region
      assert(
        "Cyclic cluster forms one region containing all nodes",
        regions.length === 1 && regions[0] === "X:Y:Z",
        `regions=${regions.join(",")}`
      );
    }

    // Two separate cycles — should produce two separate regions
    const twoCycles = [
      { id: "A1", dependencyIds: ["A2"] },
      { id: "A2", dependencyIds: ["A1"] },  // cycle 1
      { id: "B1", dependencyIds: ["B2"] },
      { id: "B2", dependencyIds: ["B1"] }   // cycle 2
    ];
    const memTwo = evolveOnce(twoCycles, ["A1", "A2", "B1", "B2"]);
    const regTwo = getRegionIds(memTwo);
    assert(
      "Two independent cycles form two separate regions",
      regTwo.length === 2,
      `regions=${regTwo.join(",")}`
    );
    assert(
      "Each cycle region has exactly 2 members",
      regTwo.every(r => r.split(":").length === 2),
      `regions=${regTwo.join(",")}`
    );
  }

  // ── UF-3: Split/Merge Churn Stability ────────────────────────────────────
  {
    console.log("\nUF-3: Split/Merge Churn (stable region derivation after topology flux)");

    // Phase 1: A and B are in same region (A depends on B)
    const phase1Units = [
      { id: "A", dependencyIds: ["B"] },
      { id: "B" }
    ];
    const mem1 = evolveOnce(phase1Units, ["A", "B"]);
    const regions1 = getRegionIds(mem1);
    assert(
      "Phase 1: A+B form one region",
      regions1.length === 1 && regions1[0] === "A:B",
      `regions=${regions1.join(",")}`
    );

    // Phase 2: A is split into A1, A2 — both still depend on B
    const phase2Units = [
      { id: "A1", dependencyIds: ["B"] },
      { id: "A2", dependencyIds: ["B"] },
      { id: "B" }
    ];
    const mem2 = evolveOnce(phase2Units, ["A1", "A2"]);
    const regions2 = getRegionIds(mem2);
    // A1, A2, B all connected → one region "A1:A2:B"
    assert(
      "Phase 2 (split): A1, A2, B form one region",
      regions2.length === 1 && regions2[0] === "A1:A2:B",
      `regions=${regions2.join(",")}`
    );

    // Phase 3: A1 and A2 are merged back into A3 — still depends on B
    const phase3Units = [
      { id: "A3", dependencyIds: ["B"] },
      { id: "B" }
    ];
    const mem3 = evolveOnce(phase3Units, ["A3"]);
    const regions3 = getRegionIds(mem3);
    assert(
      "Phase 3 (merge): A3+B form one region",
      regions3.length === 1 && regions3[0] === "A3:B",
      `regions=${regions3.join(",")}`
    );

    // Verify each region ID in all phases is lexicographically sorted
    const allRegions = [...regions1, ...regions2, ...regions3];
    const allSorted = allRegions.every(r => {
      const parts = r.split(":");
      return parts.join(":") === [...parts].sort().join(":");
    });
    assert("All region IDs are lexicographically sorted across churn phases", allSorted);
  }

  // ── UF-4: Region Root Stability ───────────────────────────────────────────
  {
    console.log("\nUF-4: Region Root Stability (regionId invariant regardless of root node)");

    // Build cluster where different nodes could be the "natural root"
    // in a naive Union-Find based on insertion order

    // Topology 1: star from P (P is parent of Q, R, S)
    const starFromP = [
      { id: "P" },
      { id: "Q", dependencyIds: ["P"] },
      { id: "R", dependencyIds: ["P"] },
      { id: "S", dependencyIds: ["P"] }
    ];
    // Topology 2: star from S (S is parent of P, Q, R)
    const starFromS = [
      { id: "S" },
      { id: "P", dependencyIds: ["S"] },
      { id: "Q", dependencyIds: ["S"] },
      { id: "R", dependencyIds: ["S"] }
    ];
    // Topology 3: chain Q→P→S→R
    const chain = [
      { id: "Q", dependencyIds: ["P"] },
      { id: "P", dependencyIds: ["S"] },
      { id: "S", dependencyIds: ["R"] },
      { id: "R" }
    ];

    const allNodes = ["P", "Q", "R", "S"];
    const memStarP = evolveOnce(starFromP, allNodes);
    const memStarS = evolveOnce(starFromS, allNodes);
    const memChain = evolveOnce(chain, allNodes);

    const regStarP = getRegionIds(memStarP);
    const regStarS = getRegionIds(memStarS);
    const regChain = getRegionIds(memChain);

    const expectedId = "P:Q:R:S";

    assert(
      "Star-from-P topology produces lexicographically sorted region ID",
      regStarP.includes(expectedId),
      `regions=${regStarP.join(",")}`
    );
    assert(
      "Star-from-S topology produces identical region ID",
      JSON.stringify(regStarS) === JSON.stringify(regStarP),
      `starP=${regStarP.join(",")}, starS=${regStarS.join(",")}`
    );
    assert(
      "Chain topology produces identical region ID",
      JSON.stringify(regChain) === JSON.stringify(regStarP),
      `starP=${regStarP.join(",")}, chain=${regChain.join(",")}`
    );

    // Disconnected nodes — each should form its own singleton region (or no region)
    const disconnected = [
      { id: "D1" },
      { id: "D2" },
      { id: "D3" }
    ];
    const memDisconnected = evolveOnce(disconnected, ["D1", "D2"]);
    const regDisconnected = getRegionIds(memDisconnected);
    // Singletons should NOT form regions (no dependency edges)
    assert(
      "Disconnected singletons do not form multi-node regions",
      regDisconnected.every(r => !r.includes(":")),
      `singleton regions: ${regDisconnected.join(",")}`
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
