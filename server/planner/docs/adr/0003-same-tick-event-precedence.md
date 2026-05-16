# ADR 0003: Same-Tick Event Precedence

## Status
Accepted

## Context
In a deterministic simulation, multiple orchestration events can occur at the exact same logical tick (e.g., a chunk completes, and another chunk starts simultaneously at tick 480). If the system state applies these events in an arbitrary or non-deterministic order, the state machine will branch, causing divergent replay execution and failure of convergence bounds.

## Decision
We enforce **Same-Tick Event Precedence** (`PLANNER_EVENT_SAME_TICK_PRECEDENCE`) as a mandatory architectural invariant.

1. **Explicit Ordering Constitution**: `server/planner/types/PlannerEventTypes.ts` contains the authoritative integer-based precedence mapping for all planner event types.
2. **Defensive Re-sorting**: Any sequence of events passed into the simulation (`simulateExecutionDay`) or replay harness (`replayTrace`) must be canonically sorted by `(tick ASC, same-tick-precedence ASC)` prior to evaluation.
3. **Strict Validation**: The `sortPlannerEvents` utility will throw a runtime error if it encounters an unregistered event type. New event types cannot be simulated until explicitly slotted into the precedence hierarchy.

## Consequences
- **Replay Continuity**: Traces captured on the device or backend can be faithfully reconstructed anywhere without timing artifacts.
- **Horizon Day Boundaries**: The introduction of `day_boundary_crossed` transitions strictly relies on this invariant to ensure that all day $N$ cleanup logic settles *before* day $N+1$ migration occurs, even if they share the exact same temporal tick.
- The planner boundary inherently filters out race conditions caused by near-simultaneous external inputs.
- Developers introducing new system events must explicitly reason about how the event interacts with concurrent state transitions.
