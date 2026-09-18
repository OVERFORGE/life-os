/**
 * KernelEndpoints Registry
 * 
 * SOLE OWNER of endpoint URL paths for the LifeOS Kernel API.
 * Centralizes all client endpoint URL mappings.
 */
export const KernelEndpoints = {
  dashboard: "/api/dashboard",
  tasks: "/api/tasks",
  goals: "/api/goals",
  world: "/api/world",
  learning: "/api/learning",
  insights: "/api/insights",
  settings: "/api/settings",
  assistant: "/api/assistant/context",
  diagnostics: "/api/diagnostics",
  conversation: "/api/conversation",
  audit: "/api/audit",
} as const;

export type KernelEndpointKey = keyof typeof KernelEndpoints;
