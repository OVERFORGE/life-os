/**
 * LifeOS Mobile Feature Flags
 * Controls progressive rollout of Ambient Interaction Layer subsystems.
 */

export const FEATURE_FLAGS = {
  // Enables the V2.1.1 Event-Driven Active Notification Manager
  // (replaces legacy 15s persistent notification polling)
  USE_AMBIENT_ACTIVE_NOTIFICATION: true,

  // Enables Headless Action Ingress via Notifee background event handlers
  USE_HEADLESS_ACTION_RECEIVER: true,

  // Enables real-time SSE event stream for cross-device sync
  USE_SURFACE_SSE_STREAM: true,
};
