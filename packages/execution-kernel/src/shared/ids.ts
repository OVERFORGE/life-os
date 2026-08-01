/**
 * Centralized ID Generator for the LifeOS Cognitive Kernel.
 * Ensures deterministic and trackable ID generation across subsystems.
 */
export function generateId(prefix: string = "id"): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  return `${prefix}_${timestamp}_${randomSuffix}`;
}
