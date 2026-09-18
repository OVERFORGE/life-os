import { DecisionDTO } from "../schema/decisionSchema";

export interface PromptDocument {
  systemPrompt: string;
  personaSection: string;
  runtimeSection: string;
  instructionsSection: string;
  outputSchemaSection: string;
  serializedPrompt: string;
  promptHash: string;
  version: string;
}

export interface LLMResponse {
  rawResponse: string;
  provider: string;
  model: string;
  metadata?: Record<string, unknown>;
}

export type ParserErrorCode = "EMPTY_RESPONSE" | "INVALID_JSON" | "SCHEMA_MISMATCH" | "SEMANTIC_VALIDATION_FAILED";

export interface DecisionError {
  code: ParserErrorCode;
  message: string;
  details?: string[];
}

export interface DecisionTrace {
  promptHash: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  engineVersion: string;
  validatorVersion: string;
}

export interface DecisionEngineResult {
  success: boolean;
  decision: DecisionDTO | null;
  prompt: PromptDocument;
  response: LLMResponse | null;
  error: DecisionError | null;
  trace: DecisionTrace | null;
}
