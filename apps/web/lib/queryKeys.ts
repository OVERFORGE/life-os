/**
 * queryKeys.ts
 * 
 * LifeOS Infrastructure Evolution V3.2
 * Centralized hierarchical query key factory and compile-time exhaustive
 * mapping to canonical delivery invalidation tags.
 */

export const queryKeys = {
  all: ["lifeos"] as const,

  // Dashboard & Surface
  dashboard: () => [...queryKeys.all, "dashboard"] as const,
  dashboardSummary: () => [...queryKeys.dashboard(), "summary"] as const,

  // Tasks & Execution Graph
  tasks: () => [...queryKeys.all, "tasks"] as const,
  taskList: (filter?: Record<string, any>) => [...queryKeys.tasks(), "list", filter] as const,
  taskDetail: (id: string) => [...queryKeys.tasks(), "detail", id] as const,

  // Goals
  goals: () => [...queryKeys.all, "goals"] as const,
  goalList: () => [...queryKeys.goals(), "list"] as const,
  goalDetail: (id: string) => [...queryKeys.goals(), "detail", id] as const,

  // Autonomous & Cognitive State
  world: () => [...queryKeys.all, "world"] as const,
  learning: () => [...queryKeys.all, "learning"] as const,
  insights: () => [...queryKeys.all, "insights"] as const,

  // System & Settings
  settings: () => [...queryKeys.all, "settings"] as const,
  diagnostics: () => [...queryKeys.all, "diagnostics"] as const,

  // Assistant & Conversation
  assistant: () => [...queryKeys.all, "assistant"] as const,
  conversation: (sessionId?: string) =>
    [...queryKeys.all, "conversation", sessionId ?? "default"] as const,
} as const;

/**
 * Authoritative canonical invalidation tags derived directly from
 * CANONICAL_DELIVERY_REGISTRY (packages/execution-kernel/src/events/delivery/CanonicalDeliveryRegistry.ts).
 */
export type CanonicalTag =
  | "tasks"
  | "dashboard"
  | "goals"
  | "learning"
  | "world"
  | "insights"
  | "settings"
  | "assistant";

/**
 * Compile-time exhaustive mapping from canonical delivery invalidation tags
 * to TanStack Query key hierarchies.
 */
export const CanonicalTagToQueryMap: Record<CanonicalTag, readonly string[]> = {
  tasks: queryKeys.tasks(),
  dashboard: queryKeys.dashboard(),
  goals: queryKeys.goals(),
  learning: queryKeys.learning(),
  world: queryKeys.world(),
  insights: queryKeys.insights(),
  settings: queryKeys.settings(),
  assistant: queryKeys.assistant(),
};

