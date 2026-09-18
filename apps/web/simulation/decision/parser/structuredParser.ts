import { LLMOutputSchema, LLMOutputDTO } from "../schema/decisionSchema";
import { DecisionError } from "../contracts/decisionContracts";

export interface ParseResult {
  success: boolean;
  data: LLMOutputDTO | null;
  error: DecisionError | null;
}

export function parseLLMOutput(rawText: string): ParseResult {
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return {
      success: false,
      data: null,
      error: {
        code: "EMPTY_RESPONSE",
        message: "LLM response text is empty or non-string.",
      },
    };
  }

  // Strip codeblock wrappers if present
  let cleanText = rawText.trim();
  if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  let jsonObject: unknown;
  try {
    jsonObject = JSON.parse(cleanText);
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: {
        code: "INVALID_JSON",
        message: `Failed to parse response as JSON: ${err instanceof Error ? err.message : "SyntaxError"}`,
      },
    };
  }

  const validation = LLMOutputSchema.safeParse(jsonObject);
  if (!validation.success) {
    const details = validation.error.issues.map(
      (issue) => `[${issue.path.join(".") || "root"}] ${issue.message}`
    );
    return {
      success: false,
      data: null,
      error: {
        code: "SCHEMA_MISMATCH",
        message: "Parsed JSON failed LLMOutputSchema validation.",
        details,
      },
    };
  }

  return {
    success: true,
    data: validation.data,
    error: null,
  };
}
