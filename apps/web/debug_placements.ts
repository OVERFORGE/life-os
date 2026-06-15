import { generateCandidatePlacements } from "./server/planner/scheduling/generateCandidatePlacements";
import { normalizeTaskForScheduling } from "./server/planner/normalization/normalizeTaskForScheduling";
import fs from "fs";

const defaultContext = {
  availabilityWindows: [
    { startMinute: 600, endMinute: 840, daysOfWeek: [1], score: 0.9, confidence: 0.9 }
  ],
  recurringConstraints: [],
  recoveryWindows: [],
  peakFocusWindows: [],
  sleepWindow: null,
  chronotype: { type: "morning", confidence: 0.8 },
  fragmentationScore: 0.2,
  dataReliabilityScore: 0.9
};

const recoveryContext = {
  ...defaultContext,
  availabilityWindows: [
    { startMinute: 600, endMinute: 840, daysOfWeek: [1], score: 1.0, confidence: 0.9 }
  ],
  recoveryWindows: [{ startMinute: 600, endMinute: 660, recoveryPenalty: 0.3, trigger: "gym" }]
};

const task = normalizeTaskForScheduling({ id: "t3", metadata: { estimatedDuration: 60 } });
const recoveryPlacements = generateCandidatePlacements(task, recoveryContext as any);

fs.writeFileSync("placements_debug.json", JSON.stringify(recoveryPlacements, null, 2));
console.log("Written to placements_debug.json");
