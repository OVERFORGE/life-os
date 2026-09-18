/**
 * Personas Module — Phase 1.2 Architectural Refinements
 * Complete digital human profile definitions, identity enums,
 * trait categories, templates, UID generation, and builder helpers.
 */

// ─── Identity Enums (Refinement 7) ─────────────────────────────────────────

export const IDENTITY_ENUMS = {
  ageRange: ["18–24", "25–34", "35–44", "45–54", "55+"] as const,
  occupation: ["FOUNDER", "SOFTWARE_ENGINEER", "STUDENT", "TRADER", "CREATOR", "MEDICAL_STUDENT", "EXECUTIVE", "OTHER"] as const,
  education: ["HIGH_SCHOOL", "BACHELORS", "MASTERS", "DOCTORATE", "SELF_TAUGHT"] as const,
  relationshipStatus: ["SINGLE", "IN_RELATIONSHIP", "MARRIED", "OTHER"] as const,
  livingSituation: ["SOLO_APARTMENT", "SHARED_FLAT", "WITH_FAMILY", "OTHER"] as const,
  incomeRange: ["< $50k", "$50k - $100k", "$100k - $200k", "> $200k"] as const,
} as const;

export type AgeRangeEnum = (typeof IDENTITY_ENUMS.ageRange)[number];
export type OccupationEnum = (typeof IDENTITY_ENUMS.occupation)[number];
export type EducationEnum = (typeof IDENTITY_ENUMS.education)[number];
export type RelationshipStatusEnum = (typeof IDENTITY_ENUMS.relationshipStatus)[number];
export type LivingSituationEnum = (typeof IDENTITY_ENUMS.livingSituation)[number];
export type IncomeRangeEnum = (typeof IDENTITY_ENUMS.incomeRange)[number];

export const IDENTITY_FIELDS = {
  ageRange: { label: "Age Range", options: IDENTITY_ENUMS.ageRange, default: "25–34" },
  occupation: { label: "Occupation", options: IDENTITY_ENUMS.occupation, default: "SOFTWARE_ENGINEER" },
  education: { label: "Education Level", options: IDENTITY_ENUMS.education, default: "BACHELORS" },
  relationshipStatus: { label: "Relationship Status", options: IDENTITY_ENUMS.relationshipStatus, default: "SINGLE" },
  livingSituation: { label: "Living Situation", options: IDENTITY_ENUMS.livingSituation, default: "SOLO_APARTMENT" },
  incomeRange: { label: "Income Range", options: IDENTITY_ENUMS.incomeRange, default: "$50k - $100k" },
} as const;

// ─── Trait Categories ───────────────────────────────────────────────────────

export interface TraitCategory {
  key: string;
  label: string;
  description: string;
  traits: TraitDefinition[];
}

export interface TraitDefinition {
  key: string;
  label: string;
  description: string;
  defaultValue: number;
}

export const TRAIT_CATEGORIES: TraitCategory[] = [
  {
    key: "discipline",
    label: "Discipline & Habits",
    description: "Regularity, adherence to routines, and self-governance.",
    traits: [
      { key: "discipline", label: "Discipline", description: "General ability to follow structured routines.", defaultValue: 50 },
      { key: "consistency", label: "Consistency", description: "Reliability in maintaining behaviors over time.", defaultValue: 50 },
      { key: "routineAdherence", label: "Routine Adherence", description: "How tightly the persona follows planned schedules.", defaultValue: 50 },
      { key: "sleepDiscipline", label: "Sleep Discipline", description: "Regularity of sleep/wake cycles.", defaultValue: 50 },
      { key: "reflectionHabit", label: "Reflection Habit", description: "Tendency to review and journal daily experiences.", defaultValue: 50 },
    ],
  },
  {
    key: "cognition",
    label: "Cognition & Focus",
    description: "Mental clarity, attentional capacity, and goal orientation.",
    traits: [
      { key: "focusEndurance", label: "Focus Endurance", description: "Ability to maintain deep work for extended sessions.", defaultValue: 50 },
      { key: "motivation", label: "Motivation", description: "Intrinsic drive to initiate and pursue tasks.", defaultValue: 50 },
      { key: "planning", label: "Planning", description: "Tendency to pre-structure days, weeks, and goals.", defaultValue: 50 },
      { key: "goalAmbition", label: "Goal Ambition", description: "Size and scope of goals the persona typically sets.", defaultValue: 50 },
      { key: "notificationResponsiveness", label: "Notification Responsiveness", description: "Reactivity to incoming alerts and messages.", defaultValue: 50 },
    ],
  },
  {
    key: "stress",
    label: "Stress & Resilience",
    description: "Emotional regulation, pressure tolerance, and recovery capacity.",
    traits: [
      { key: "stressSensitivity", label: "Stress Sensitivity", description: "Susceptibility to pressure and adverse conditions.", defaultValue: 50 },
      { key: "recoverySpeed", label: "Recovery Speed", description: "How quickly the persona recovers from setbacks.", defaultValue: 50 },
      { key: "socialLoad", label: "Social Load", description: "Capacity for social interaction before draining.", defaultValue: 50 },
      { key: "energyStability", label: "Energy Stability", description: "Consistency of energy levels throughout the day.", defaultValue: 50 },
      { key: "adaptability", label: "Adaptability", description: "Flexibility in adjusting to unexpected changes.", defaultValue: 50 },
    ],
  },
  {
    key: "execution",
    label: "Execution & Dynamics",
    description: "How the persona acts, decides, and delivers on commitments.",
    traits: [
      { key: "executionBias", label: "Execution Bias", description: "Preference for action over analysis.", defaultValue: 50 },
      { key: "decisionConfidence", label: "Decision Confidence", description: "Assertiveness in making choices without hesitation.", defaultValue: 50 },
      { key: "riskTolerance", label: "Risk Tolerance", description: "Comfort with uncertainty and high-stakes decisions.", defaultValue: 50 },
      { key: "procrastination", label: "Procrastination", description: "Tendency to defer tasks (higher = more procrastination).", defaultValue: 30 },
      { key: "perfectionism", label: "Perfectionism", description: "Tendency to over-refine at the cost of throughput.", defaultValue: 30 },
    ],
  },
];

// ─── Initial State Fields ────────────────────────────────────────────────────

export interface InitialStateDefinition {
  key: string;
  label: string;
  description: string;
  defaultValue: number;
}

export const INITIAL_STATE_FIELDS: InitialStateDefinition[] = [
  { key: "stress", label: "Stress", description: "Starting stress level.", defaultValue: 30 },
  { key: "energy", label: "Energy", description: "Starting energy level.", defaultValue: 70 },
  { key: "mood", label: "Mood", description: "Baseline emotional state.", defaultValue: 65 },
  { key: "sleepDebt", label: "Sleep Debt", description: "Accumulated sleep deficit.", defaultValue: 20 },
  { key: "mentalFatigue", label: "Mental Fatigue", description: "Cognitive load carried into simulation.", defaultValue: 25 },
  { key: "currentMotivation", label: "Current Motivation", description: "Motivation at simulation start.", defaultValue: 70 },
  { key: "goalLoad", label: "Goal Load", description: "Volume of active goals at start.", defaultValue: 40 },
  { key: "confidence", label: "Confidence", description: "Self-efficacy belief at simulation start.", defaultValue: 65 },
];

// ─── Lifestyle Fields ────────────────────────────────────────────────────────

export const LIFESTYLE_FIELDS = {
  wakeWindow: { label: "Wake Window", options: ["04:00–05:00", "05:00–06:00", "06:00–07:00", "07:00–08:00", "08:00–09:00", "09:00–10:00"], default: "06:00–07:00" },
  sleepWindow: { label: "Sleep Window", options: ["20:00–21:00", "21:00–22:00", "22:00–23:00", "23:00–00:00", "00:00–01:00", "01:00–02:00"], default: "22:00–23:00" },
  typicalWorkHours: { label: "Typical Work Hours", options: ["4–6h", "6–8h", "8–10h", "10–12h", "12h+"], default: "8–10h" },
  weekendPattern: { label: "Weekend Pattern", options: ["Full Rest", "Light Work", "Side Projects", "Same as Weekday", "Catch-up Sessions"], default: "Light Work" },
  peakProductivity: { label: "Peak Productivity", options: ["Early Morning (5–8)", "Morning (8–11)", "Midday (11–14)", "Afternoon (14–17)", "Evening (17–21)", "Night (21–02)"], default: "Morning (8–11)" },
  gymPreference: { label: "Gym Preference", options: ["None", "Morning Gym", "Lunchtime Gym", "Evening Gym", "Weekend Only", "Home Workout"], default: "Morning Gym" },
  mealRegularity: { label: "Meal Regularity", options: ["Very Irregular", "Irregular", "Moderate", "Regular", "Very Regular"], default: "Regular" },
} as const;

// ─── Motivation Fields ───────────────────────────────────────────────────────

export const MOTIVATION_FIELDS = {
  primaryDriver: { label: "Primary Driver", options: ["Financial Freedom", "Creative Output", "Physical Peak", "Status & Recognition", "Knowledge Mastery", "Family & Legacy", "Impact & Mission", "Survival Mode"], default: "Financial Freedom" },
  planningHorizon: { label: "Planning Horizon", options: ["Day-to-Day", "Weekly", "Monthly", "Quarterly", "Annual", "Multi-Year"], default: "Quarterly" },
  goalStyle: { label: "Goal Style", options: ["Single Big Goal", "Portfolio Goals", "Theme-Based", "Milestone Driven", "Intuitive / Flexible"], default: "Portfolio Goals" },
  executionStyle: { label: "Execution Style", options: ["Sprint-Based", "Steady State", "Reactive", "Structured Blocks", "Chaotic Creative"], default: "Structured Blocks" },
} as const;

// ─── Archetypes ──────────────────────────────────────────────────────────────

export const PERSONA_ARCHETYPES = [
  "FOUNDER",
  "STUDENT",
  "TRADER",
  "CONTENT_CREATOR",
  "MEDICAL_STUDENT",
  "REMOTE_WORKER",
  "BURNED_OUT_FOUNDER",
  "CUSTOM",
] as const;

export type PersonaArchetype = (typeof PERSONA_ARCHETYPES)[number];

// ─── Deterministic UID Generator (Refinement 2) ──────────────────────────────

export function generatePersonaUid(archetype: string = "CUSTOM"): string {
  const cleanArch = (archetype || "CUSTOM").toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const randNum = Math.floor(1000 + Math.random() * 9000);
  return `PER_${cleanArch}_${randNum}`;
}

// ─── Default Builders ────────────────────────────────────────────────────────

export function buildDefaultTraits(): Record<string, number> {
  const traits: Record<string, number> = {};
  for (const cat of TRAIT_CATEGORIES) {
    for (const t of cat.traits) {
      traits[t.key] = t.defaultValue;
    }
  }
  return traits;
}

export function buildDefaultInitialState(): Record<string, number> {
  const state: Record<string, number> = {};
  for (const f of INITIAL_STATE_FIELDS) {
    state[f.key] = f.defaultValue;
  }
  return state;
}

export function buildDefaultLifestyle(): Record<string, string> {
  return {
    wakeWindow: LIFESTYLE_FIELDS.wakeWindow.default,
    sleepWindow: LIFESTYLE_FIELDS.sleepWindow.default,
    typicalWorkHours: LIFESTYLE_FIELDS.typicalWorkHours.default,
    weekendPattern: LIFESTYLE_FIELDS.weekendPattern.default,
    peakProductivity: LIFESTYLE_FIELDS.peakProductivity.default,
    gymPreference: LIFESTYLE_FIELDS.gymPreference.default,
    mealRegularity: LIFESTYLE_FIELDS.mealRegularity.default,
  };
}

export function buildDefaultMotivation(): Record<string, string> {
  return {
    primaryDriver: MOTIVATION_FIELDS.primaryDriver.default,
    planningHorizon: MOTIVATION_FIELDS.planningHorizon.default,
    goalStyle: MOTIVATION_FIELDS.goalStyle.default,
    executionStyle: MOTIVATION_FIELDS.executionStyle.default,
  };
}

export function buildDefaultIdentity(): Record<string, string> {
  return {
    ageRange: IDENTITY_FIELDS.ageRange.default,
    occupation: IDENTITY_FIELDS.occupation.default,
    education: IDENTITY_FIELDS.education.default,
    relationshipStatus: IDENTITY_FIELDS.relationshipStatus.default,
    livingSituation: IDENTITY_FIELDS.livingSituation.default,
    incomeRange: IDENTITY_FIELDS.incomeRange.default,
  };
}

export function buildDefaultCapabilities(): Record<string, boolean> {
  return {
    canExecuteCode: true,
    canAccessFinancials: true,
    canMakeDecisions: true,
    canScheduleTasks: true,
  };
}

export function buildDefaultMemoryProfile(): Record<string, unknown> {
  return {
    episodicMemory: {},
    semanticMemory: {},
    workingMemory: {},
    reflectionDepth: 50,
  };
}

// ─── Persona Templates ────────────────────────────────────────────────────────

export interface PersonaTemplate {
  id: string;
  label: string;
  archetype: PersonaArchetype;
  description: string;
  identity: Record<string, string>;
  traits: Record<string, number>;
  initialState: Record<string, number>;
  lifestyle: Record<string, string>;
  motivation: Record<string, string>;
  tags: string[];
}

export const PERSONA_TEMPLATES: PersonaTemplate[] = [
  {
    id: "FOUNDER",
    label: "Founder",
    archetype: "FOUNDER",
    description: "High-drive entrepreneur operating in ambiguity and pressure. Strong planner, high execution bias.",
    identity: { ageRange: "25–34", occupation: "FOUNDER", education: "BACHELORS", relationshipStatus: "SINGLE", livingSituation: "SOLO_APARTMENT", incomeRange: "$100k - $200k" },
    tags: ["founder", "high-performance", "entrepreneurship"],
    traits: { discipline: 80, consistency: 70, routineAdherence: 65, sleepDiscipline: 55, reflectionHabit: 60, focusEndurance: 82, motivation: 88, planning: 92, goalAmbition: 90, notificationResponsiveness: 60, stressSensitivity: 55, recoverySpeed: 65, socialLoad: 50, energyStability: 60, adaptability: 75, executionBias: 88, decisionConfidence: 82, riskTolerance: 80, procrastination: 20, perfectionism: 40 },
    initialState: { stress: 45, energy: 65, mood: 60, sleepDebt: 35, mentalFatigue: 40, currentMotivation: 85, goalLoad: 70, confidence: 78 },
    lifestyle: { wakeWindow: "05:00–06:00", sleepWindow: "23:00–00:00", typicalWorkHours: "10–12h", weekendPattern: "Side Projects", peakProductivity: "Morning (8–11)", gymPreference: "Morning Gym", mealRegularity: "Irregular" },
    motivation: { primaryDriver: "Financial Freedom", planningHorizon: "Quarterly", goalStyle: "Portfolio Goals", executionStyle: "Sprint-Based" },
  },
  {
    id: "STUDENT",
    label: "Student",
    archetype: "STUDENT",
    description: "University student balancing academics, social life, and personal growth under deadline pressure.",
    identity: { ageRange: "18–24", occupation: "STUDENT", education: "HIGH_SCHOOL", relationshipStatus: "SINGLE", livingSituation: "SHARED_FLAT", incomeRange: "< $50k" },
    tags: ["student", "learning", "academic"],
    traits: { discipline: 50, consistency: 45, routineAdherence: 40, sleepDiscipline: 35, reflectionHabit: 40, focusEndurance: 55, motivation: 60, planning: 45, goalAmbition: 55, notificationResponsiveness: 80, stressSensitivity: 70, recoverySpeed: 70, socialLoad: 75, energyStability: 55, adaptability: 65, executionBias: 45, decisionConfidence: 45, riskTolerance: 40, procrastination: 65, perfectionism: 55 },
    initialState: { stress: 50, energy: 65, mood: 60, sleepDebt: 40, mentalFatigue: 35, currentMotivation: 55, goalLoad: 30, confidence: 50 },
    lifestyle: { wakeWindow: "08:00–09:00", sleepWindow: "00:00–01:00", typicalWorkHours: "6–8h", weekendPattern: "Catch-up Sessions", peakProductivity: "Afternoon (14–17)", gymPreference: "Evening Gym", mealRegularity: "Irregular" },
    motivation: { primaryDriver: "Knowledge Mastery", planningHorizon: "Monthly", goalStyle: "Milestone Driven", executionStyle: "Reactive" },
  },
  {
    id: "TRADER",
    label: "Trader",
    archetype: "TRADER",
    description: "High-pressure decision-maker operating in volatile environments requiring rapid emotional regulation.",
    identity: { ageRange: "25–34", occupation: "TRADER", education: "BACHELORS", relationshipStatus: "SINGLE", livingSituation: "SOLO_APARTMENT", incomeRange: "> $200k" },
    tags: ["trading", "finance", "high-stakes"],
    traits: { discipline: 75, consistency: 70, routineAdherence: 80, sleepDiscipline: 70, reflectionHabit: 65, focusEndurance: 80, motivation: 75, planning: 70, goalAmbition: 75, notificationResponsiveness: 90, stressSensitivity: 45, recoverySpeed: 75, socialLoad: 40, energyStability: 70, adaptability: 80, executionBias: 85, decisionConfidence: 85, riskTolerance: 88, procrastination: 15, perfectionism: 35 },
    initialState: { stress: 55, energy: 70, mood: 65, sleepDebt: 20, mentalFatigue: 40, currentMotivation: 80, goalLoad: 50, confidence: 75 },
    lifestyle: { wakeWindow: "04:00–05:00", sleepWindow: "21:00–22:00", typicalWorkHours: "8–10h", weekendPattern: "Light Work", peakProductivity: "Early Morning (5–8)", gymPreference: "Morning Gym", mealRegularity: "Regular" },
    motivation: { primaryDriver: "Financial Freedom", planningHorizon: "Weekly", goalStyle: "Single Big Goal", executionStyle: "Structured Blocks" },
  },
  {
    id: "CONTENT_CREATOR",
    label: "Content Creator",
    archetype: "CONTENT_CREATOR",
    description: "Creative professional driven by output volume, audience engagement, and creative expression cycles.",
    identity: { ageRange: "25–34", occupation: "CREATOR", education: "BACHELORS", relationshipStatus: "IN_RELATIONSHIP", livingSituation: "SOLO_APARTMENT", incomeRange: "$50k - $100k" },
    tags: ["creative", "social media", "content"],
    traits: { discipline: 45, consistency: 50, routineAdherence: 40, sleepDiscipline: 45, reflectionHabit: 55, focusEndurance: 60, motivation: 70, planning: 40, goalAmbition: 65, notificationResponsiveness: 85, stressSensitivity: 65, recoverySpeed: 65, socialLoad: 80, energyStability: 55, adaptability: 80, executionBias: 60, decisionConfidence: 55, riskTolerance: 60, procrastination: 55, perfectionism: 65 },
    initialState: { stress: 40, energy: 65, mood: 70, sleepDebt: 30, mentalFatigue: 30, currentMotivation: 72, goalLoad: 35, confidence: 60 },
    lifestyle: { wakeWindow: "07:00–08:00", sleepWindow: "00:00–01:00", typicalWorkHours: "6–8h", weekendPattern: "Same as Weekday", peakProductivity: "Evening (17–21)", gymPreference: "Home Workout", mealRegularity: "Moderate" },
    motivation: { primaryDriver: "Creative Output", planningHorizon: "Monthly", goalStyle: "Theme-Based", executionStyle: "Chaotic Creative" },
  },
  {
    id: "MEDICAL_STUDENT",
    label: "Medical Student",
    archetype: "MEDICAL_STUDENT",
    description: "Extreme cognitive load environment with high information density, low autonomy, and rigid scheduling.",
    identity: { ageRange: "25–34", occupation: "MEDICAL_STUDENT", education: "BACHELORS", relationshipStatus: "SINGLE", livingSituation: "SHARED_FLAT", incomeRange: "< $50k" },
    tags: ["medical", "high-cognitive", "structured"],
    traits: { discipline: 80, consistency: 75, routineAdherence: 70, sleepDiscipline: 50, reflectionHabit: 50, focusEndurance: 85, motivation: 70, planning: 75, goalAmbition: 80, notificationResponsiveness: 60, stressSensitivity: 75, recoverySpeed: 50, socialLoad: 40, energyStability: 50, adaptability: 55, executionBias: 65, decisionConfidence: 60, riskTolerance: 35, procrastination: 40, perfectionism: 75 },
    initialState: { stress: 65, energy: 55, mood: 50, sleepDebt: 45, mentalFatigue: 60, currentMotivation: 65, goalLoad: 60, confidence: 55 },
    lifestyle: { wakeWindow: "05:00–06:00", sleepWindow: "23:00–00:00", typicalWorkHours: "10–12h", weekendPattern: "Catch-up Sessions", peakProductivity: "Morning (8–11)", gymPreference: "Weekend Only", mealRegularity: "Irregular" },
    motivation: { primaryDriver: "Knowledge Mastery", planningHorizon: "Annual", goalStyle: "Milestone Driven", executionStyle: "Steady State" },
  },
  {
    id: "REMOTE_WORKER",
    label: "Remote Worker",
    archetype: "REMOTE_WORKER",
    description: "Knowledge worker operating autonomously from home, balancing flexibility with boundary discipline.",
    identity: { ageRange: "25–34", occupation: "SOFTWARE_ENGINEER", education: "BACHELORS", relationshipStatus: "IN_RELATIONSHIP", livingSituation: "SOLO_APARTMENT", incomeRange: "$100k - $200k" },
    tags: ["remote", "knowledge-work", "async"],
    traits: { discipline: 55, consistency: 60, routineAdherence: 55, sleepDiscipline: 60, reflectionHabit: 55, focusEndurance: 65, motivation: 60, planning: 60, goalAmbition: 55, notificationResponsiveness: 70, stressSensitivity: 55, recoverySpeed: 65, socialLoad: 55, energyStability: 65, adaptability: 70, executionBias: 60, decisionConfidence: 60, riskTolerance: 45, procrastination: 45, perfectionism: 50 },
    initialState: { stress: 35, energy: 68, mood: 65, sleepDebt: 20, mentalFatigue: 30, currentMotivation: 62, goalLoad: 40, confidence: 62 },
    lifestyle: { wakeWindow: "07:00–08:00", sleepWindow: "22:00–23:00", typicalWorkHours: "8–10h", weekendPattern: "Full Rest", peakProductivity: "Morning (8–11)", gymPreference: "Lunchtime Gym", mealRegularity: "Regular" },
    motivation: { primaryDriver: "Financial Freedom", planningHorizon: "Quarterly", goalStyle: "Portfolio Goals", executionStyle: "Steady State" },
  },
  {
    id: "BURNED_OUT_FOUNDER",
    label: "Burned-out Founder",
    archetype: "BURNED_OUT_FOUNDER",
    description: "Post-peak founder in recovery. Historically high-performer now managing chronic fatigue and motivation collapse.",
    identity: { ageRange: "25–34", occupation: "FOUNDER", education: "BACHELORS", relationshipStatus: "SINGLE", livingSituation: "SOLO_APARTMENT", incomeRange: "$100k - $200k" },
    tags: ["burnout", "recovery", "founder"],
    traits: { discipline: 30, consistency: 25, routineAdherence: 20, sleepDiscipline: 25, reflectionHabit: 45, focusEndurance: 30, motivation: 25, planning: 35, goalAmbition: 55, notificationResponsiveness: 40, stressSensitivity: 90, recoverySpeed: 25, socialLoad: 20, energyStability: 20, adaptability: 35, executionBias: 30, decisionConfidence: 30, riskTolerance: 35, procrastination: 80, perfectionism: 70 },
    initialState: { stress: 80, energy: 25, mood: 25, sleepDebt: 65, mentalFatigue: 80, currentMotivation: 20, goalLoad: 30, confidence: 25 },
    lifestyle: { wakeWindow: "08:00–09:00", sleepWindow: "00:00–01:00", typicalWorkHours: "4–6h", weekendPattern: "Full Rest", peakProductivity: "Midday (11–14)", gymPreference: "None", mealRegularity: "Very Irregular" },
    motivation: { primaryDriver: "Survival Mode", planningHorizon: "Day-to-Day", goalStyle: "Single Big Goal", executionStyle: "Reactive" },
  },
  {
    id: "BLANK",
    label: "Blank Persona",
    archetype: "CUSTOM",
    description: "Empty template. All traits set to neutral defaults for fully custom configuration.",
    identity: buildDefaultIdentity(),
    tags: ["custom", "blank"],
    traits: buildDefaultTraits(),
    initialState: buildDefaultInitialState(),
    lifestyle: buildDefaultLifestyle(),
    motivation: buildDefaultMotivation(),
  },
];
