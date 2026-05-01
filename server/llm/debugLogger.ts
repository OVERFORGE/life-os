// server/llm/debugLogger.ts
// Structured intent + execution debug logger.
// Console-only for now — easy to swap to DB later.

export interface IntentLogEntry {
  input: string;
  intent: string;
  confidence: number;
  actionsExecuted?: string[];
  timestamp?: string;
}

export function logIntent(entry: IntentLogEntry): void {
  const ts = new Date().toISOString();
  const actions = entry.actionsExecuted?.length
    ? entry.actionsExecuted.join(", ")
    : "none";

  const confidenceIcon =
    entry.confidence >= 0.85 ? "🟢" :
    entry.confidence >= 0.6  ? "🟡" : "🔴";

  console.log(
    `\n[LifeOS::Intent] ${ts}\n` +
    `  ${confidenceIcon} intent     : ${entry.intent}\n` +
    `     confidence : ${(entry.confidence * 100).toFixed(0)}%\n` +
    `     input      : "${entry.input.slice(0, 120)}"\n` +
    `     actions    : ${actions}`
  );
}

export function logExecution(
  actionType: string,
  success: boolean,
  detail?: string
): void {
  const icon = success ? "✅" : "❌";
  console.log(
    `[LifeOS::Exec] ${icon} ${actionType}${detail ? ` — ${detail}` : ""}`
  );
}
