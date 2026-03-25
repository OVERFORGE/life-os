export const assistantTools = [
  {
    name: "create_goal",
    description: "Create a new life goal for the user",
    parameters: {
      title: "string",
      type: "skill | health | productivity | lifestyle",
      signals: "string[]"
    }
  },
  {
    name: "log_daily_activity",
    description: "Log a daily life activity",
    parameters: {
      activity: "string",
      duration: "number"
    }
  },
  {
    name: "analyze_system_state",
    description: "Analyze user's productivity system"
  }
];