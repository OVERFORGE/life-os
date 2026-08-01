export function shouldCallTool(intent: string): boolean {
  if (intent === "log_activity" || intent === "create_goal" || intent === "delete_goal" || intent === "override_mental_score") {
    return true;
  }
  return false;
}
