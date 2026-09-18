import { SimulationPersonaDTO } from "../../types";

/** Recursively sorts object keys alphabetically to guarantee byte-for-byte deterministic serialization */
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => stableStringify(item)).join(",") + "]";
  }

  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify((obj as Record<string, unknown>)[key])}`);
  return "{" + pairs.join(",") + "}";
}

export interface PersonaContextData {
  code: string;
  name: string;
  archetype: string;
  identity: Record<string, string>;
  traits: Record<string, number>;
  lifestyle: Record<string, string>;
  motivation: Record<string, string>;
  capabilities: Record<string, boolean>;
}

export function extractPersonaContext(persona: SimulationPersonaDTO): PersonaContextData {
  return {
    code: persona.code ?? "UNKNOWN",
    name: persona.name ?? "Unknown Persona",
    archetype: persona.archetype ?? "custom",
    identity: persona.identity ?? {},
    traits: persona.traits ?? {},
    lifestyle: persona.lifestyle ?? {},
    motivation: persona.motivation ?? {},
    capabilities: persona.capabilities ?? {},
  };
}

export function formatPersonaContext(persona: SimulationPersonaDTO): string {
  const data = extractPersonaContext(persona);
  return [
    `PERSONA PROFILE: ${data.name} [${data.code}] (${data.archetype})`,
    `IDENTITY: ${stableStringify(data.identity)}`,
    `TRAITS: ${stableStringify(data.traits)}`,
    `LIFESTYLE: ${stableStringify(data.lifestyle)}`,
    `MOTIVATION: ${stableStringify(data.motivation)}`,
    `CAPABILITIES: ${stableStringify(data.capabilities)}`,
  ].join("\n");
}
