/**
 * ActivityDefinitionRegistry — Immutable Activity Definition Registry
 *
 * Separates static activity configuration (base cost deltas, default durations,
 * focus factors) from runtime session instances.
 */

export type ActivityDefinitionId =
  | "DEEP_WORK"
  | "LIGHT_WORK"
  | "MEETING"
  | "BREAK"
  | "MEAL"
  | "EXERCISE"
  | "SLEEP"
  | "ROUTINE";

export interface ActivityDefinition {
  definitionId: ActivityDefinitionId;
  title: string;
  defaultDurationMins: number;
  baseFocusDeltaPerMin: number;
  baseEnergyDeltaPerMin: number;
  baseFatigueDeltaPerMin: number;
  baseStressDeltaPerMin: number;
  baseHungerDeltaPerMin: number;
  baseHydrationDeltaPerMin: number;
  taskProgressBaseRate: number;
  isWorkActivity: boolean;
  isRestActivity: boolean;
}

export class ActivityDefinitionRegistry {
  private static readonly DEFINITIONS: Record<ActivityDefinitionId, ActivityDefinition> = {
    DEEP_WORK: {
      definitionId: "DEEP_WORK",
      title: "Deep Work Focus",
      defaultDurationMins: 60,
      baseFocusDeltaPerMin: -0.3,
      baseEnergyDeltaPerMin: -0.2,
      baseFatigueDeltaPerMin: 0.15,
      baseStressDeltaPerMin: 0.08,
      baseHungerDeltaPerMin: 0.1,
      baseHydrationDeltaPerMin: -0.05,
      taskProgressBaseRate: 1.5,
      isWorkActivity: true,
      isRestActivity: false,
    },
    LIGHT_WORK: {
      definitionId: "LIGHT_WORK",
      title: "Light Work & Admin",
      defaultDurationMins: 45,
      baseFocusDeltaPerMin: -0.15,
      baseEnergyDeltaPerMin: -0.1,
      baseFatigueDeltaPerMin: 0.1,
      baseStressDeltaPerMin: 0.05,
      baseHungerDeltaPerMin: 0.1,
      baseHydrationDeltaPerMin: -0.05,
      taskProgressBaseRate: 0.8,
      isWorkActivity: true,
      isRestActivity: false,
    },
    MEETING: {
      definitionId: "MEETING",
      title: "Sync & Meeting",
      defaultDurationMins: 30,
      baseFocusDeltaPerMin: -0.15,
      baseEnergyDeltaPerMin: -0.1,
      baseFatigueDeltaPerMin: 0.1,
      baseStressDeltaPerMin: 0.05,
      baseHungerDeltaPerMin: 0.1,
      baseHydrationDeltaPerMin: -0.05,
      taskProgressBaseRate: 0.5,
      isWorkActivity: true,
      isRestActivity: false,
    },
    BREAK: {
      definitionId: "BREAK",
      title: "Rest Break",
      defaultDurationMins: 20,
      baseFocusDeltaPerMin: 0.4,
      baseEnergyDeltaPerMin: 0.15,
      baseFatigueDeltaPerMin: -0.1,
      baseStressDeltaPerMin: -0.3,
      baseHungerDeltaPerMin: 0.05,
      baseHydrationDeltaPerMin: 0.0,
      taskProgressBaseRate: 0.0,
      isWorkActivity: false,
      isRestActivity: true,
    },
    MEAL: {
      definitionId: "MEAL",
      title: "Nourishment Block",
      defaultDurationMins: 30,
      baseFocusDeltaPerMin: 0.2,
      baseEnergyDeltaPerMin: 0.4,
      baseFatigueDeltaPerMin: -0.1,
      baseStressDeltaPerMin: -0.4,
      baseHungerDeltaPerMin: -2.5,
      baseHydrationDeltaPerMin: 1.0,
      taskProgressBaseRate: 0.0,
      isWorkActivity: false,
      isRestActivity: true,
    },
    EXERCISE: {
      definitionId: "EXERCISE",
      title: "Physical Workout",
      defaultDurationMins: 45,
      baseFocusDeltaPerMin: 0.1,
      baseEnergyDeltaPerMin: -0.45,
      baseFatigueDeltaPerMin: 0.3,
      baseStressDeltaPerMin: -0.5,
      baseHungerDeltaPerMin: 0.2,
      baseHydrationDeltaPerMin: -0.3,
      taskProgressBaseRate: 0.0,
      isWorkActivity: false,
      isRestActivity: false,
    },
    SLEEP: {
      definitionId: "SLEEP",
      title: "Night Sleep Window",
      defaultDurationMins: 420,
      baseFocusDeltaPerMin: 0.6,
      baseEnergyDeltaPerMin: 0.5,
      baseFatigueDeltaPerMin: -0.6,
      baseStressDeltaPerMin: -0.6,
      baseHungerDeltaPerMin: 0.05,
      baseHydrationDeltaPerMin: -0.02,
      taskProgressBaseRate: 0.0,
      isWorkActivity: false,
      isRestActivity: true,
    },
    ROUTINE: {
      definitionId: "ROUTINE",
      title: "Daily Routine",
      defaultDurationMins: 30,
      baseFocusDeltaPerMin: 0.1,
      baseEnergyDeltaPerMin: 0.0,
      baseFatigueDeltaPerMin: 0.05,
      baseStressDeltaPerMin: -0.1,
      baseHungerDeltaPerMin: 0.1,
      baseHydrationDeltaPerMin: -0.05,
      taskProgressBaseRate: 0.0,
      isWorkActivity: false,
      isRestActivity: false,
    },
  };

  public static getDefinition(id: ActivityDefinitionId): ActivityDefinition {
    const def = this.DEFINITIONS[id];
    if (!def) {
      return this.DEFINITIONS.ROUTINE;
    }
    return def;
  }
}
