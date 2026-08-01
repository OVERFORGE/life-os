import { ConversationSemantics } from "./ConversationSemantics";
import { ConcreteEntity, ShortTermMemoryState } from "./EntityResolver";

export interface ResolvedContext {
  confirmedProposal?: any;
  cancelledProposalId?: string;
  targetEntity?: ConcreteEntity | null;
  hasPendingProposal: boolean;
  activeWorkflow?: string | null;
  stmUpdates: Partial<ShortTermMemoryState>;
}

/**
 * ShortTermMemoryResolver
 * 
 * PURE STATE MACHINE.
 * Operates strictly on structured ConversationSemantics and the persisted ShortTermMemoryState.
 * 
 * ARCHITECTURAL RULES:
 * 1. NEVER reads raw user text.
 * 2. NEVER performs natural language processing.
 * 3. NEVER queries the database directly.
 */
export class ShortTermMemoryResolver {
  private static instance: ShortTermMemoryResolver;

  static getInstance(): ShortTermMemoryResolver {
    if (!ShortTermMemoryResolver.instance) {
      ShortTermMemoryResolver.instance = new ShortTermMemoryResolver();
    }
    return ShortTermMemoryResolver.instance;
  }

  resolve(
    semantics: ConversationSemantics,
    resolvedEntity: ConcreteEntity | null,
    stmState: ShortTermMemoryState | null
  ): ResolvedContext {
    const stm = stmState || {};
    const pendingList = stm.pendingConfirmations || [];
    const hasPending = pendingList.length > 0;
    const intent = semantics.conversationIntent;

    const stmUpdates: Partial<ShortTermMemoryState> = {};
    let confirmedProposal: any = undefined;
    let cancelledProposalId: string | undefined = undefined;

    // If an entity was resolved, update activeEntity in STM
    if (resolvedEntity) {
      stmUpdates.activeEntity = {
        type: resolvedEntity.type,
        id: resolvedEntity.id,
        name: resolvedEntity.name,
        lastMentionedAt: new Date(),
      };
    }

    switch (intent) {
      case "confirm_pending_action": {
        if (hasPending) {
          confirmedProposal = pendingList[0];
          // Remove confirmed item from pending queue
          stmUpdates.pendingConfirmations = pendingList.slice(1);
          console.log(`⚡ [STM_RESOLVER] Confirmed pending proposal: "${confirmedProposal.description || confirmedProposal.id}"`);
        }
        break;
      }

      case "cancel_pending_action": {
        if (hasPending) {
          const cancelled = pendingList[0];
          cancelledProposalId = cancelled.id;
          stmUpdates.pendingConfirmations = pendingList.slice(1);
          console.log(`⚡ [STM_RESOLVER] Cancelled pending proposal: "${cancelled.description || cancelled.id}"`);
        }
        break;
      }

      case "update_entity": {
        if (resolvedEntity) {
          console.log(`⚡ [STM_RESOLVER] Target entity for update: "${resolvedEntity.name}" (${resolvedEntity.id})`);
        }
        break;
      }

      case "delete_entity": {
        if (resolvedEntity) {
          console.log(`⚡ [STM_RESOLVER] Target entity for deletion: "${resolvedEntity.name}" (${resolvedEntity.id})`);
        }
        break;
      }

      case "continue_workflow": {
        stmUpdates.currentWorkflow = stm.currentWorkflow;
        break;
      }

      case "new_request": {
        // Clear workflow context for a brand new request
        stmUpdates.currentWorkflow = null;
        break;
      }

      default:
        break;
    }

    return {
      confirmedProposal,
      cancelledProposalId,
      targetEntity: resolvedEntity,
      hasPendingProposal: hasPending,
      activeWorkflow: stmUpdates.currentWorkflow ?? stm.currentWorkflow,
      stmUpdates,
    };
  }
}
