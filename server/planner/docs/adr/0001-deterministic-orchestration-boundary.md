# ADR 0001: Deterministic Orchestration Boundary

## Status
Accepted

## Context
The LifeOS predictive orchestration engine generates schedules, adapts to execution drift, and repairs scheduling conflicts. As the engine scales to support multi-day horizons and complex dependency graphs, identifying regressions and reproducing behavior becomes exponentially difficult. Non-deterministic behavior—such as relying on wall-clock time, implicit system state, or non-seeded probabilistic heuristics—makes the planner untestable, unpredictable, and unstable over long execution periods.

## Decision
We establish a **Strict Deterministic Orchestration Boundary** around the Planner Kernel.

The following architectural invariants MUST be preserved:
1. **Determinism**: The core transition functions (`applyPlannerEvent`, `generateCandidateSchedules`, `generateIncrementalRepairPlan`) must be mathematically pure. Given identical input state and identical events, they must produce byte-identical output.
2. **No Wall-Clock Time**: Functions like `Date.now()`, `new Date()`, or `setTimeout` are strictly PROHIBITED inside the planner core. All temporal progression must be driven by `logicalTick` provided by the simulation or execution harness.
3. **No Stochastic Behavior**: Machine learning models, LLM calls, and probabilistic heuristics can only serve as *read-only inputs* to the kernel. Inside the kernel boundary, all risk scores and constraints are treated as deterministic heuristics.
4. **Stable Collections**: Operations over maps or sets that are sensitive to insertion order must ensure deterministic sorting (e.g., lexicographic sort by ID) before projecting state.

## Consequences
- Testing is provably reliable. Any failure in simulation is deterministic and fully debuggable via replay.
- External systems (UI, ML engines, Analytics) are cleanly decoupled from orchestration logic.
- We cannot use adaptive or randomized tie-breaking inside the planner without explicitly seeding the randomness.
