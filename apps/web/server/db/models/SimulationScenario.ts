import mongoose, { Schema, model, models } from "mongoose";

const SimulationScenarioSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    
    // Scenario parameters and initial conditions
    initialConditions: { type: Schema.Types.Mixed, default: {} },
    scheduledEvents: [{ type: Schema.Types.Mixed }],
    validationRules: [{ type: Schema.Types.Mixed }],
    
    isTemplate: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const SimulationScenario =
  models.SimulationScenario || model("SimulationScenario", SimulationScenarioSchema);
