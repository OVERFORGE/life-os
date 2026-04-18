export function shouldCallTool(intent: string): boolean {
  if (intent === "log_activity" || intent === "create_goal") {
    return true;
  }
  return false;
}
