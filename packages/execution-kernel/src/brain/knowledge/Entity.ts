/**
 * Centralized registry of supported Entity types in LifeOS.
 * Simple, extensible representation without premature dynamic plugin overhead.
 */
export const EntityTypes = {
  User: "User",
  Goal: "Goal",
  Task: "Task",
  Habit: "Habit",
  Meal: "Meal",
  Workout: "Workout",
  Project: "Project",
  Location: "Location",
  Person: "Person",
  Company: "Company",
} as const;

export type EntityType = (typeof EntityTypes)[keyof typeof EntityTypes] | string;

export interface Entity<TAttributes = Record<string, any>> {
  id: string;
  type: EntityType;
  attributes: TAttributes;
  createdAt: number;
  updatedAt: number;
}

export function createEntity<TAttributes = Record<string, any>>(
  id: string,
  type: EntityType,
  attributes: TAttributes
): Entity<TAttributes> {
  const now = Date.now();
  return {
    id,
    type,
    attributes,
    createdAt: now,
    updatedAt: now,
  };
}
