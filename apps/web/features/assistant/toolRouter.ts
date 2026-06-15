export function routeTool(intent: string) {
  switch (intent) {
    case "create_goal":
      return "create_goal";

    case "log_activity":
      return "log_activity";

    case "analyze_system":
      return "analyze_system";

    default:
      return null;
  }
}