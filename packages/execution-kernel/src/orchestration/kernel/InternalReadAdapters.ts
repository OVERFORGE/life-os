import { ActionProposal } from "../contracts/ActionProposalContracts";
import { IKernelActionAdapter } from "./ActionAdapters";
import { CapabilityRegistry } from "../capabilities/CapabilityRegistry";
import { TaskRepository } from "../../repositories/TaskRepository";
import { GoalRepository } from "../../repositories/GoalRepository";
import { ScheduleQueryRepository } from "../../repositories/ScheduleQueryRepository";
import { DailyLogRepository } from "../../repositories/DailyLogRepository";
import { TelemetryHistoryRepository } from "../../repositories/TelemetryHistoryRepository";
import { MemoryRepository } from "../../memory/MemoryRepository";

function extractReadParams(proposal: ActionProposal): Record<string, any> {
  const raw = proposal.parameters ?? proposal.payload ?? {};
  // Support direct payload or wrapped { capabilityURN, parameters }
  if (raw && typeof raw === "object" && raw.capabilityURN && raw.parameters && typeof raw.parameters === "object") {
    return raw.parameters;
  }
  return raw && typeof raw === "object" ? raw : {};
}

function validateAgainstRegistry(urn: string, params: Record<string, any>): { valid: boolean; reason?: string } {
  const result = CapabilityRegistry.getInstance().validateParameters(urn, params);
  if (!result.valid) {
    return { valid: false, reason: result.reason || `Invalid parameters for ${urn}` };
  }
  return { valid: true };
}

/**
 * lifeos.tasks.query Adapter
 */
export class QueryTasksAdapter implements IKernelActionAdapter {
  private readonly urn = "lifeos.tasks.query";

  async validatePreconditions(proposal: ActionProposal): Promise<{ valid: boolean; reason?: string }> {
    const params = extractReadParams(proposal);
    return validateAgainstRegistry(this.urn, params);
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const params = extractReadParams(proposal);
    const check = validateAgainstRegistry(this.urn, params);
    if (!check.valid) {
      throw new Error(`[INVALID_PARAMETER]: ${check.reason}`);
    }
    return await TaskRepository.getInstance().queryTasks(userId, params);
  }
}

/**
 * lifeos.goals.query Adapter
 */
export class QueryGoalsAdapter implements IKernelActionAdapter {
  private readonly urn = "lifeos.goals.query";

  async validatePreconditions(proposal: ActionProposal): Promise<{ valid: boolean; reason?: string }> {
    const params = extractReadParams(proposal);
    return validateAgainstRegistry(this.urn, params);
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const params = extractReadParams(proposal);
    const check = validateAgainstRegistry(this.urn, params);
    if (!check.valid) {
      throw new Error(`[INVALID_PARAMETER]: ${check.reason}`);
    }
    return await GoalRepository.getInstance().queryGoals(userId, params);
  }
}

/**
 * lifeos.schedule.query_occurrences Adapter
 */
export class QueryOccurrencesAdapter implements IKernelActionAdapter {
  private readonly urn = "lifeos.schedule.query_occurrences";

  async validatePreconditions(proposal: ActionProposal): Promise<{ valid: boolean; reason?: string }> {
    const params = extractReadParams(proposal);
    return validateAgainstRegistry(this.urn, params);
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const params = extractReadParams(proposal);
    const check = validateAgainstRegistry(this.urn, params);
    if (!check.valid) {
      throw new Error(`[INVALID_PARAMETER]: ${check.reason}`);
    }
    return await ScheduleQueryRepository.getInstance().queryOccurrences(userId, params as any);
  }
}

/**
 * lifeos.daily_logs.query_range Adapter
 */
export class QueryDailyLogsAdapter implements IKernelActionAdapter {
  private readonly urn = "lifeos.daily_logs.query_range";

  async validatePreconditions(proposal: ActionProposal): Promise<{ valid: boolean; reason?: string }> {
    const params = extractReadParams(proposal);
    return validateAgainstRegistry(this.urn, params);
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const params = extractReadParams(proposal);
    const check = validateAgainstRegistry(this.urn, params);
    if (!check.valid) {
      throw new Error(`[INVALID_PARAMETER]: ${check.reason}`);
    }
    return await DailyLogRepository.getInstance().queryRange(userId, params as any);
  }
}

/**
 * lifeos.telemetry.query_state_history Adapter
 */
export class QueryTelemetryHistoryAdapter implements IKernelActionAdapter {
  private readonly urn = "lifeos.telemetry.query_state_history";

  async validatePreconditions(proposal: ActionProposal): Promise<{ valid: boolean; reason?: string }> {
    const params = extractReadParams(proposal);
    return validateAgainstRegistry(this.urn, params);
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const params = extractReadParams(proposal);
    const check = validateAgainstRegistry(this.urn, params);
    if (!check.valid) {
      throw new Error(`[INVALID_PARAMETER]: ${check.reason}`);
    }
    return await TelemetryHistoryRepository.getInstance().queryStateHistory(userId, params);
  }
}

/**
 * lifeos.memory.search Adapter
 */
export class QueryMemoryAdapter implements IKernelActionAdapter {
  private readonly urn = "lifeos.memory.search";

  async validatePreconditions(proposal: ActionProposal): Promise<{ valid: boolean; reason?: string }> {
    const params = extractReadParams(proposal);
    const check = validateAgainstRegistry(this.urn, params);
    if (!check.valid) return check;
    if (params.referenceTime !== undefined && Number.isNaN(Date.parse(params.referenceTime))) {
      return { valid: false, reason: `Invalid referenceTime ISO string: ${params.referenceTime}` };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const params = extractReadParams(proposal);
    const check = validateAgainstRegistry(this.urn, params);
    if (!check.valid) {
      throw new Error(`[INVALID_PARAMETER]: ${check.reason}`);
    }
    return await MemoryRepository.getInstance().queryMemories(userId, params as any);
  }
}
