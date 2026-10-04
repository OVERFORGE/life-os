# LifeOS Kernel V1 — Official Architecture Specification

Welcome to the official **LifeOS Kernel V1 Architecture Specification**. This document set serves as the authoritative, permanent engineering reference for the LifeOS Native Execution Kernel.

Every engineer contributing to LifeOS must study this specification before proposing changes or adding features to the codebase.

---

## Quick Links

- 🌟 [**LifeOS Kernel V1 — Explained for Everyone (Non-Technical Guide)**](./non-technical-guide.md)  
  *A simple, intuitive guide explaining how LifeOS Kernel V1 works for non-technical readers or anyone familiar with AI.*
- 🔍 [**Kernel ↔ Frontend Architecture Gap Analysis Report**](./frontend-gap-analysis.md)  
  *Comprehensive Principal Architect audit evaluating frontend alignment, duplicated logic, missing endpoints, and P0–P3 roadmap.*

---

## Specification Index

1. [01 — Introduction](./01-introduction.md)
   - What LifeOS is, why the Kernel exists, problems solved, deterministic AI paradigm.
2. [02 — Kernel Philosophy](./02-philosophy-and-design-principles.md)
   - Determinism, replayability, constraint memory, repair-first architecture, read-only world modeling.
3. [03 — High-Level Architecture](./03-high-level-architecture.md)
   - Pipeline topology, causal execution ordering, subsystem sequence diagrams.
4. [04 — Kernel Pipeline](./04-kernel-pipeline.md)
   - Deep-dive analysis of all 14 pipeline stages: inputs, outputs, latencies, failure modes.
5. [05 — Data Flow & Type System](./05-data-flow-and-type-system.md)
   - Immutable object flow, transformations, ownership, schema definitions.
6. [06 — Subsystem Reference](./06-subsystem-reference.md)
   - Detailed specification of all kernel singletons, public APIs, and private responsibilities.
7. [07 — Kernel State Management](./07-kernel-state-management.md)
   - Execution state, memory state, world state, learning state, state lifetimes and persistence boundaries.
8. [08 — Execution Graph Engine](./08-execution-graph-engine.md)
   - Dependency topology, topological sorting, critical paths, atomic transaction applier, versioning.
9. [09 — Learning Engine](./09-learning-engine.md)
   - Behavioral profiles, confidence engine, habit learning, memory scoring, adaptive context.
10. [10 — World Model V2](./10-world-model-v2.md)
    - Macro life states, goal pressure V2, project states, relationship context, trends, predictions.
11. [11 — Distributed Infrastructure](./11-distributed-infrastructure.md)
    - Sync engine, sync state machine, replication manager, offline queue, conflict resolution, checkpoints.
12. [12 — Diagnostics & Observability Framework](./12-diagnostics-and-observability.md)
    - Profiler, trace engine, health engine, audit engine, performance budgets, metric registry.
13. [13 — Configuration & Shared Utilities](./13-configuration-and-utilities.md)
    - Centralized `KernelConfig`, `PerformanceTimer`, log tags, latency budgets.
14. [14 — Public API Reference](./14-public-api-reference.md)
    - Comprehensive reference for all exported kernel classes, interfaces, and types.
15. [15 — End-to-End Runtime Walkthrough](./15-runtime-walkthrough.md)
    - Complete trace of a user request ("Remind me to workout tomorrow") through all 23 pipeline steps.
16. [16 — Determinism Guarantees](./16-determinism-guarantees.md)
    - Replayability proofs, deterministic state machines, causal invariance.
17. [17 — Architectural Rules](./17-architectural-rules.md)
    - Non-negotiable architectural laws, ownership boundaries, mutation constraints.
18. [18 — Design Decisions & Trade-offs](./18-design-decisions-and-tradeoffs.md)
    - Architectural Decision Records (ADRs) explaining technical choices.
19. [19 — Developer Extension Guide](./19-extension-guide.md)
    - Rules and procedures for extending the kernel without breaking determinism or replayability.
20. [20 — The Kernel Constitution](./20-kernel-constitution.md)
    - The permanent engineering laws governing LifeOS Kernel V1.

---

## Architectural Snapshot

- **Kernel Version**: `1.0.0-V1`
- **Primary Orchestrator**: `KernelEngine`
- **Execution Pipeline**: 23 Stage Causal Flow
- **Determinism**: 100% Replayable & Event Sourced
- **AI Strategy**: Read-only language translation & prompt generation (No black-box state mutation)
