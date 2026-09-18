import { createHash } from "crypto";
import { RuntimeSnapshot, SimulationPersonaDTO } from "../../types";
import { PromptDocument } from "../contracts/decisionContracts";
import { formatPersonaContext } from "../context/personaContext";
import { formatRuntimeContext } from "../context/runtimeContext";
import { SYSTEM_PROMPT_TEMPLATE } from "../templates/systemPrompt";
import { buildUserPromptSection, OUTPUT_SCHEMA_SECTION } from "../templates/userPrompt";
import { PROMPT_VERSION } from "../constants";

export function computePromptHash(serializedPromptText: string): string {
  return createHash("sha256").update(serializedPromptText, "utf8").digest("hex");
}

export function buildPromptDocument(
  snapshot: RuntimeSnapshot,
  persona: SimulationPersonaDTO,
  version: string = PROMPT_VERSION
): PromptDocument {
  const personaSection = formatPersonaContext(persona);
  const runtimeSection = formatRuntimeContext(snapshot);
  const instructionsSection = buildUserPromptSection(personaSection, runtimeSection);
  const outputSchemaSection = OUTPUT_SCHEMA_SECTION;

  const userPromptText = [
    instructionsSection,
    ``,
    outputSchemaSection,
  ].join("\n");

  const fullSerializedPrompt = [
    `=== SYSTEM INSTRUCTION ===`,
    SYSTEM_PROMPT_TEMPLATE,
    ``,
    `=== USER PROMPT ===`,
    userPromptText,
  ].join("\n");

  const promptHash = computePromptHash(fullSerializedPrompt);

  return {
    systemPrompt: SYSTEM_PROMPT_TEMPLATE,
    personaSection,
    runtimeSection,
    instructionsSection,
    outputSchemaSection,
    serializedPrompt: fullSerializedPrompt,
    promptHash,
    version,
  };
}
