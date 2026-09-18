import { ActionProposal, KernelExecutionResult } from "../contracts/ActionProposalContracts";

export interface CompensationResult {
  compensated: boolean;
  error?: string;
  reversalDetails?: string;
}

export interface IKernelActionAdapter<TPayload = any, TResult = any> {
  validatePreconditions(proposal: ActionProposal<TPayload>, userId: string): Promise<{ valid: boolean; reason?: string }>;
  execute(proposal: ActionProposal<TPayload>, userId: string): Promise<TResult>;
  compensate(proposal: ActionProposal<TPayload>, previousResult: TResult, userId: string): Promise<CompensationResult>;
}

/**
 * Registry of pluggable action adapters.
 * Invariant 13: Compensating Sagas for multi-action batches.
 */
export class ActionAdapterRegistry {
  private static instance: ActionAdapterRegistry;
  private adapters: Map<string, IKernelActionAdapter> = new Map();

  static getInstance(): ActionAdapterRegistry {
    if (!ActionAdapterRegistry.instance) {
      ActionAdapterRegistry.instance = new ActionAdapterRegistry();
    }
    return ActionAdapterRegistry.instance;
  }

  register(actionType: string, adapter: IKernelActionAdapter): this {
    this.adapters.set(actionType, adapter);
    return this;
  }

  get(actionType: string): IKernelActionAdapter | undefined {
    return this.adapters.get(actionType);
  }

  has(actionType: string): boolean {
    return this.adapters.has(actionType);
  }
}
