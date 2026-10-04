/**
 * Production Replay Fixture Engine (Phase 13)
 * 
 * Records and replays model-generated artifacts with cryptographic SHA-256
 * integrity checking. Guarantees 100% deterministic test execution without
 * live LLM network calls or token billing (Class B Testing).
 * 
 * INVARIANT: Replay must NEVER invoke a live LLM.
 */

import crypto from "crypto";
import { ActionProposal } from "../../orchestration/contracts/ActionProposalContracts";

export interface IRecordedReplayArtifact {
  fixtureId: string;
  inputHash: string; // SHA-256 of normalized prompt + context
  recordedAt: number;
  semanticTurn: {
    intentCategory: string;
    targetEntities: Array<{ name: string; type: string }>;
    rawUserLanguage: string;
  };
  contextSnapshot: Record<string, unknown>;
  stmSnapshot: Record<string, unknown>;
  actionProposals: ActionProposal[];
  executionResults: Array<{ capabilityURN: string; success: boolean; resultId: string }>;
  cryptographicSignature: string;
}

export class ProductionReplayFixtureEngine {
  private static instance: ProductionReplayFixtureEngine;
  private fixtureStore: Map<string, IRecordedReplayArtifact> = new Map();

  static getInstance(): ProductionReplayFixtureEngine {
    if (!ProductionReplayFixtureEngine.instance) {
      ProductionReplayFixtureEngine.instance = new ProductionReplayFixtureEngine();
    }
    return ProductionReplayFixtureEngine.instance;
  }

  /**
   * Computes a deterministic SHA-256 hash of prompt and context.
   */
  computeInputHash(userPrompt: string, context: Record<string, unknown>): string {
    const serialized = JSON.stringify({
      prompt: userPrompt.trim().toLowerCase(),
      context: Object.keys(context).sort().reduce((acc: any, k) => {
        acc[k] = context[k];
        return acc;
      }, {}),
    });
    return crypto.createHash("sha256").update(serialized).digest("hex");
  }

  /**
   * Records a production interaction trace for replay testing.
   */
  recordFixture(
    fixtureId: string,
    userPrompt: string,
    context: Record<string, unknown>,
    stm: Record<string, unknown>,
    semanticTurn: IRecordedReplayArtifact["semanticTurn"],
    actionProposals: ActionProposal[],
    executionResults: IRecordedReplayArtifact["executionResults"]
  ): IRecordedReplayArtifact {
    const inputHash = this.computeInputHash(userPrompt, context);
    const signature = crypto
      .createHash("sha256")
      .update(`${fixtureId}:${inputHash}:${actionProposals.length}`)
      .digest("hex");

    const fixture: IRecordedReplayArtifact = {
      fixtureId,
      inputHash,
      recordedAt: Date.now(),
      semanticTurn,
      contextSnapshot: context,
      stmSnapshot: stm,
      actionProposals,
      executionResults,
      cryptographicSignature: signature,
    };

    this.fixtureStore.set(fixtureId, fixture);
    return fixture;
  }

  /**
   * Replays an interaction trace deterministically without invoking live LLMs.
   */
  replayFixture(
    fixtureId: string,
    userPrompt: string,
    context: Record<string, unknown>
  ): {
    matched: boolean;
    fixture?: IRecordedReplayArtifact;
    error?: string;
  } {
    const fixture = this.fixtureStore.get(fixtureId);
    if (!fixture) {
      return { matched: false, error: `Fixture '${fixtureId}' not found in store.` };
    }

    const currentHash = this.computeInputHash(userPrompt, context);
    if (currentHash !== fixture.inputHash) {
      return {
        matched: false,
        error: `Cryptographic Mismatch: Current input hash does not match recorded fixture hash. Replay drift detected.`,
      };
    }

    return {
      matched: true,
      fixture,
    };
  }

  hasFixture(fixtureId: string): boolean {
    return this.fixtureStore.has(fixtureId);
  }

  clearFixtures(): void {
    this.fixtureStore.clear();
  }
}
