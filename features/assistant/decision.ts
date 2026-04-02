export function decideAction(intent: string) {
  switch (intent) {
    case "create_goal":
      return {
        requiresTool: true,
        tool: "create_goal",
      };

    case "log_activity":
      return {
        requiresTool: true,
        tool: "log_activity",
      };

    case "analyze_system":
      return {
        requiresTool: true,
        tool: "analyze_system",
      };

    case "planning":
    case "ask_question":
    case "casual_chat":
    default:
      return {
        requiresTool: false,
        tool: null,
      };
  }
}