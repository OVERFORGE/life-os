export function decideAction(intent: string) {
  const toolIntents = [
    "create_goal",
    "log_activity",
    "analyze_system",
  ];

  return {
    requiresTool: toolIntents.includes(intent),
  };
}