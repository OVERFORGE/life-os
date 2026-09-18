import { SimulationPersonaDTO } from "../../types";

export interface MappedPersonaUserContext {
  userId: string;
  personaUid: string;
  personaCode: string;
  personaName: string;
}

export function mapPersonaToUserContext(persona: SimulationPersonaDTO): MappedPersonaUserContext {
  const code = (persona.personaUid || persona.code || "VIRTUAL_USER").toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const virtualUserId = `SIM_${code}`;

  return {
    userId: virtualUserId,
    personaUid: persona.personaUid ?? code,
    personaCode: persona.code ?? "VIRTUAL_USER",
    personaName: persona.name ?? "Virtual User",
  };
}
