import mongoose, { Schema, model, models } from "mongoose";

// ─── Sub-Schemas ─────────────────────────────────────────────────────────────

const TraitsSchema = new Schema(
  {
    discipline: { type: Number, min: 0, max: 100, default: 50 },
    consistency: { type: Number, min: 0, max: 100, default: 50 },
    routineAdherence: { type: Number, min: 0, max: 100, default: 50 },
    sleepDiscipline: { type: Number, min: 0, max: 100, default: 50 },
    reflectionHabit: { type: Number, min: 0, max: 100, default: 50 },
    focusEndurance: { type: Number, min: 0, max: 100, default: 50 },
    motivation: { type: Number, min: 0, max: 100, default: 50 },
    planning: { type: Number, min: 0, max: 100, default: 50 },
    goalAmbition: { type: Number, min: 0, max: 100, default: 50 },
    notificationResponsiveness: { type: Number, min: 0, max: 100, default: 50 },
    stressSensitivity: { type: Number, min: 0, max: 100, default: 50 },
    recoverySpeed: { type: Number, min: 0, max: 100, default: 50 },
    socialLoad: { type: Number, min: 0, max: 100, default: 50 },
    energyStability: { type: Number, min: 0, max: 100, default: 50 },
    adaptability: { type: Number, min: 0, max: 100, default: 50 },
    executionBias: { type: Number, min: 0, max: 100, default: 50 },
    decisionConfidence: { type: Number, min: 0, max: 100, default: 50 },
    riskTolerance: { type: Number, min: 0, max: 100, default: 50 },
    procrastination: { type: Number, min: 0, max: 100, default: 30 },
    perfectionism: { type: Number, min: 0, max: 100, default: 30 },
  },
  { _id: false }
);

const InitialStateSchema = new Schema(
  {
    stress: { type: Number, min: 0, max: 100, default: 30 },
    energy: { type: Number, min: 0, max: 100, default: 70 },
    mood: { type: Number, min: 0, max: 100, default: 65 },
    sleepDebt: { type: Number, min: 0, max: 100, default: 20 },
    mentalFatigue: { type: Number, min: 0, max: 100, default: 25 },
    currentMotivation: { type: Number, min: 0, max: 100, default: 70 },
    goalLoad: { type: Number, min: 0, max: 100, default: 40 },
    confidence: { type: Number, min: 0, max: 100, default: 65 },
  },
  { _id: false }
);

const LifestyleSchema = new Schema(
  {
    wakeWindow: { type: String, default: "06:00–07:00" },
    sleepWindow: { type: String, default: "22:00–23:00" },
    typicalWorkHours: { type: String, default: "8–10h" },
    weekendPattern: { type: String, default: "Light Work" },
    peakProductivity: { type: String, default: "Morning (8–11)" },
    gymPreference: { type: String, default: "Morning Gym" },
    mealRegularity: { type: String, default: "Regular" },
  },
  { _id: false }
);

const MotivationSchema = new Schema(
  {
    primaryDriver: { type: String, default: "Financial Freedom" },
    planningHorizon: { type: String, default: "Quarterly" },
    goalStyle: { type: String, default: "Portfolio Goals" },
    executionStyle: { type: String, default: "Structured Blocks" },
  },
  { _id: false }
);

const IdentitySchema = new Schema(
  {
    ageRange: { type: String, default: "25–34" },
    occupation: { type: String, default: "SOFTWARE_ENGINEER" },
    education: { type: String, default: "BACHELORS" },
    relationshipStatus: { type: String, default: "SINGLE" },
    livingSituation: { type: String, default: "SOLO_APARTMENT" },
    incomeRange: { type: String, default: "$50k - $100k" },
  },
  { _id: false }
);

const CapabilitiesSchema = new Schema(
  {
    canExecuteCode: { type: Boolean, default: true },
    canAccessFinancials: { type: Boolean, default: true },
    canMakeDecisions: { type: Boolean, default: true },
    canScheduleTasks: { type: Boolean, default: true },
  },
  { _id: false }
);

const MemoryProfileSchema = new Schema(
  {
    episodicMemory: { type: Schema.Types.Mixed, default: {} },
    semanticMemory: { type: Schema.Types.Mixed, default: {} },
    workingMemory: { type: Schema.Types.Mixed, default: {} },
    reflectionDepth: { type: Number, min: 0, max: 100, default: 50 },
  },
  { _id: false }
);

const ValidationMetadataSchema = new Schema(
  {
    passed: { type: Boolean, default: true },
    checksum: { type: String, default: "" },
    validatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const AnalyticsSchema = new Schema(
  {
    simulationCount: { type: Number, default: 0 },
    lastSimulationAt: { type: Date, default: null },
    averageOutcomeScore: { type: Number, default: null },
  },
  { _id: false }
);

// ─── Main Schema ─────────────────────────────────────────────────────────────

const SimulationPersonaSchema = new Schema(
  {
    // Deterministic exportable UID (PER_FOUNDER_0001)
    personaUid: { type: String, required: true, unique: true, index: true },

    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },

    // Blueprint vs Instance tracking (Refinement 1)
    templateId: { type: String, default: null },
    templateVersion: { type: String, default: "1.0.0" },
    isTemplate: { type: Boolean, default: false },

    // Explicit typed sub-schemas (Refinement 1 & 4 & 7)
    traits: { type: TraitsSchema, default: () => ({}) },
    initialState: { type: InitialStateSchema, default: () => ({}) },
    lifestyle: { type: LifestyleSchema, default: () => ({}) },
    motivation: { type: MotivationSchema, default: () => ({}) },
    identity: { type: IdentitySchema, default: () => ({}) },

    // Capabilities & Memory (Refinement 3 & 4)
    capabilities: { type: CapabilitiesSchema, default: () => ({}) },
    memoryProfile: { type: MemoryProfileSchema, default: () => ({}) },

    // Supported scenario identifiers (Refinement 5)
    supportedScenarioTypes: [{ type: String }],

    // Flexible metadata and behavior policy placeholder
    metadata: { type: Schema.Types.Mixed, default: {} },
    behaviorPolicy: { type: Schema.Types.Mixed, default: {} },

    // Independent Versioning fields (Refinement 3 & 8)
    promptVersion: { type: String, default: "v1.0.0" },
    personaVersion: { type: String, default: "1.0.0" },
    schemaVersion: { type: String, default: "1.0.0" },
    isLatest: { type: Boolean, default: true },
    previousVersionId: { type: Schema.Types.ObjectId, ref: "SimulationPersona", default: null },

    // Read-only analytics & validation metadata (Refinement 6 & 8)
    analytics: { type: AnalyticsSchema, default: () => ({}) },
    validation: { type: ValidationMetadataSchema, default: () => ({}) },

    // Hidden reserved kernel compilation metadata (Refinement 9)
    executionMetadata: { type: Schema.Types.Mixed, default: {} },

    // Active status & Soft Delete support
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },

    tags: [{ type: String }],
  },
  { timestamps: true }
);

export const SimulationPersona =
  models.SimulationPersona || model("SimulationPersona", SimulationPersonaSchema);
