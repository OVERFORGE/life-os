# ADR 0002: Canonical Topology Projection

## Status
Accepted

## Context
During simulation and observability operations (such as computing topology diffs, generating repair traces, and verifying repair convergence), the system needs to determine whether two scheduling states represent the same "topology." If we compare raw placement objects, memory addresses, or timestamped metadata, identical structures might be considered different, leading to false oscillations or incorrect diffs.

## Decision
We establish a **Canonical Topology Projection** (`projectTopology.ts`) as the single source of truth for topology representation and comparison.

1. **Projection Substrate**: The canonical projection extracts only structural data relevant to the sequence and placement of tasks: `id`, `startMinute`, and `endMinute`.
2. **Deterministic Hashing**: The `topologyHash` is computed by performing a stable JSON stringification over the projected placements, strictly sorted lexicographically by `chunkId`.
3. **Universality**: All downstream observability systems—including `diffTopologies`, `verifyRepairConvergence`, and `replayTrace`—must utilize this centralized canonical projection rather than inspecting the `PlannerSimulationState` schedule directly.

## Consequences
- **Replay Integrity**: The simulation terminal topology hash is guaranteed to be stable and mathematically reproducible from identical sequences of events.
- **Trace Efficiency**: Topology hashes can be used as fast short-circuits for structural comparisons, reducing the computational overhead of diffing operations.
- Any new structural properties (e.g., cross-day pointers) that impact scheduling topology must be explicitly added to the projection to be considered in convergence detection.
