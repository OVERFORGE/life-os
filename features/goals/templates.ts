export const GOAL_TEMPLATES = [
  {
    title: "Get Fit & Healthy",
    type: "maintenance",
    signals: [
      { key: "physical.gym", weight: 3 },
      { key: "physical.steps", weight: 1 },
      { key: "sleep.hours", weight: 1 },
      { key: "mental.energy", weight: 1 },
    ],
  },
  {
    title: "Build LifeOS",
    type: "performance",
    signals: [
      { key: "work.coded", weight: 3 },
      { key: "work.deepWorkHours", weight: 3 },
      { key: "mental.focus", weight: 1 },
    ],
  },
  {
    title: "Become Disciplined",
    type: "identity",
    signals: [
      { key: "habits.noFap", weight: 2 },
      { key: "habits.coding", weight: 2 },
      { key: "physical.gym", weight: 2 },
    ],
  },
];
