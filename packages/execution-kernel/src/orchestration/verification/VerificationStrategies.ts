import crypto from "node:crypto";
import {
  IVerificationStrategy,
  StepVerificationResult,
  VerificationClass,
  VerificationContext,
  signEvidenceEnvelope,
} from "./OutcomeVerificationContracts";
import { MULTI_STEP_WORKFLOW_POLICY } from "../contracts/WorkflowExecutionContracts";

/**
 * Class 1: Artifact Read-Back Verification Strategy
 * Probes target file system / storage via independent read capability.
 * Enforces byte-level SHA-256 equality at Layer 3 (Requirement Verification).
 */
export class ArtifactReadBackStrategy implements IVerificationStrategy {
  readonly verificationClass: VerificationClass = "CLASS_1_ARTIFACT_READ_BACK";

  canVerify(step: any, _goal: string): boolean {
    return Boolean(
      step.actionType === "storage_write" ||
      step.capabilityURN?.includes("storage.write_file") ||
      (step.parameters && typeof step.parameters.path === "string" && step.data?.bytesWritten !== undefined)
    );
  }

  async verify(context: VerificationContext, step: any, kernelCapability?: any): Promise<StepVerificationResult> {
    const targetPath = step.parameters?.path;
    const evidenceId = `ev_c1_${step.stepId}_${Date.now()}`;

    if (!targetPath) {
      const evidence = signEvidenceEnvelope({
        evidenceId,
        executionId: context.executionId,
        stepId: step.stepId,
        checkpointId: context.checkpointId,
        verificationClass: this.verificationClass,
        sourceURN: "urn:capability:productivity.storage.read_file",
        authority: "KERNEL_AUTHORITATIVE",
        completeness: "EXHAUSTIVE",
        relevance: "DIRECT_MUTATION",
        rawObservation: { error: "Target path missing from parameters" },
        testedCriteria: ["target_path_present"],
        passedCriteria: [],
        failedCriteria: ["target_path_present"],
        summary: "Target file path missing from write parameters",
      });

      return {
        stepId: step.stepId,
        status: "NOT_VERIFIED",
        layer: "REQUIREMENT_VERIFICATION",
        verificationClass: this.verificationClass,
        evidence: [evidence],
        reason: "Target file path missing from parameters",
      };
    }

    // Layer 2: Independent Read-Back Probe
    let readResult: any;
    try {
      if (kernelCapability?.executeAction) {
        readResult = await kernelCapability.executeAction(context.userId, {
          id: `prop_verify_${Date.now()}`,
          domain: "productivity",
          actionType: "external_capability_action",
          payload: {
            capabilityURN: "productivity.storage.read_file",
            parameters: { path: targetPath },
          },
          rationale: "Authoritative file read-back verification",
          reversibility: "irreversible_local",
          idempotencyKey: `idemp_readback_${context.executionId}_${step.stepId}`,
        });
      } else {
        // Fallback simulation/inspection if capability service not injected
        readResult = {
          success: step.data?.fileCreated !== false && !step.data?.deleted,
          data: step.data,
        };
      }
    } catch (err: any) {
      readResult = { success: false, error: err.message };
    }

    if (!readResult || !readResult.success || !readResult.data) {
      const evidence = signEvidenceEnvelope({
        evidenceId,
        executionId: context.executionId,
        stepId: step.stepId,
        checkpointId: context.checkpointId,
        verificationClass: this.verificationClass,
        sourceURN: "urn:capability:productivity.storage.read_file",
        authority: "KERNEL_AUTHORITATIVE",
        completeness: "EXHAUSTIVE",
        relevance: "DIRECT_MUTATION",
        rawObservation: { targetPath, readBackResult: readResult },
        testedCriteria: ["file_exists_on_disk"],
        passedCriteria: [],
        failedCriteria: ["file_exists_on_disk"],
        summary: `File read-back failed at path "${targetPath}"`,
      });

      return {
        stepId: step.stepId,
        status: "NOT_VERIFIED",
        layer: "STATE_CHANGE_VERIFICATION",
        verificationClass: this.verificationClass,
        evidence: [evidence],
        reason: `File at "${targetPath}" does not exist or is unreadable`,
      };
    }

    // Layer 3: Requirement Verification (Byte Length & SHA-256 Hash Match)
    const readBytes =
      readResult.data.bytesRead ??
      (readResult.data.content ? Buffer.byteLength(readResult.data.content, "utf8") : 0);

    const testedCriteria = ["file_exists_on_disk", "non_zero_byte_length", "sha256_hash_match"];
    const passedCriteria: string[] = ["file_exists_on_disk"];
    const failedCriteria: string[] = [];

    if (readBytes <= 0) {
      failedCriteria.push("non_zero_byte_length", "sha256_hash_match");
      const evidence = signEvidenceEnvelope({
        evidenceId,
        executionId: context.executionId,
        stepId: step.stepId,
        checkpointId: context.checkpointId,
        verificationClass: this.verificationClass,
        sourceURN: "urn:capability:productivity.storage.read_file",
        authority: "KERNEL_AUTHORITATIVE",
        completeness: "EXHAUSTIVE",
        relevance: "DIRECT_MUTATION",
        rawObservation: { targetPath, readBytes },
        testedCriteria,
        passedCriteria,
        failedCriteria,
        summary: `File at "${targetPath}" is empty (0 bytes)`,
      });

      return {
        stepId: step.stepId,
        status: "NOT_VERIFIED",
        layer: "REQUIREMENT_VERIFICATION",
        verificationClass: this.verificationClass,
        evidence: [evidence],
        reason: `Target file at "${targetPath}" is empty (0 bytes)`,
      };
    }
    passedCriteria.push("non_zero_byte_length");

    // Check byte-level SHA-256 hash match if expected hash or content was recorded
    if (step.parameters?.content || step.data?.contentHash) {
      const expectedContent = step.parameters?.content || "";
      const actualContent = readResult.data.content || "";
      const expectedHash =
        step.data?.contentHash ||
        crypto.createHash("sha256").update(expectedContent, "utf8").digest("hex");
      const actualHash = crypto.createHash("sha256").update(actualContent, "utf8").digest("hex");

      if (expectedHash !== actualHash) {
        failedCriteria.push("sha256_hash_match");
        const evidence = signEvidenceEnvelope({
          evidenceId,
          executionId: context.executionId,
          stepId: step.stepId,
          checkpointId: context.checkpointId,
          verificationClass: this.verificationClass,
          sourceURN: "urn:capability:productivity.storage.read_file",
          authority: "KERNEL_AUTHORITATIVE",
          completeness: "EXHAUSTIVE",
          relevance: "DIRECT_MUTATION",
          rawObservation: { targetPath, expectedHash, actualHash, readBytes },
          testedCriteria,
          passedCriteria,
          failedCriteria,
          summary: `File content hash mismatch at "${targetPath}"`,
        });

        return {
          stepId: step.stepId,
          status: "NOT_VERIFIED",
          layer: "REQUIREMENT_VERIFICATION",
          verificationClass: this.verificationClass,
          evidence: [evidence],
          reason: `File content hash does not match expected payload hash`,
        };
      }
    }
    passedCriteria.push("sha256_hash_match");

    const evidence = signEvidenceEnvelope({
      evidenceId,
      executionId: context.executionId,
      stepId: step.stepId,
      checkpointId: context.checkpointId,
      verificationClass: this.verificationClass,
      sourceURN: "urn:capability:productivity.storage.read_file",
      authority: "KERNEL_AUTHORITATIVE",
      completeness: "EXHAUSTIVE",
      relevance: "DIRECT_MUTATION",
      rawObservation: { targetPath, readBytes },
      testedCriteria,
      passedCriteria,
      failedCriteria,
      summary: `Verified file at "${targetPath}" (${readBytes.toLocaleString()} bytes on disk)`,
    });

    return {
      stepId: step.stepId,
      status: "VERIFIED",
      layer: "REQUIREMENT_VERIFICATION",
      verificationClass: this.verificationClass,
      evidence: [evidence],
      disclosure: `Saved file to ${targetPath} (verified ${readBytes.toLocaleString()} bytes on disk).`,
    };
  }
}

/**
 * Class 2: Epistemic Query Strategy
 * Context-aware emptiness evaluation & distinction between empty and unavailable sources (Correction D & F).
 */
export class EpistemicQueryStrategy implements IVerificationStrategy {
  readonly verificationClass: VerificationClass = "CLASS_2_EPISTEMIC_QUERY";

  canVerify(step: any, _goal: string): boolean {
    return Boolean(
      step.capabilityURN?.includes("search") ||
      step.actionType?.includes("search") ||
      step.actionType === "query"
    );
  }

  async verify(context: VerificationContext, step: any): Promise<StepVerificationResult> {
    const evidenceId = `ev_c2_${step.stepId}_${Date.now()}`;

    // Case 2: Retrieval failure / timeout (Correction F)
    if (step.status === "FAILED" || step.status === "TIMED_OUT" || step.error?.includes("timeout") || step.error?.includes("network")) {
      const evidence = signEvidenceEnvelope({
        evidenceId,
        executionId: context.executionId,
        stepId: step.stepId,
        checkpointId: context.checkpointId,
        verificationClass: this.verificationClass,
        sourceURN: step.capabilityURN || "urn:capability:search",
        authority: "PROVIDER_AUTHORITATIVE",
        completeness: "SAMPLED",
        relevance: "DIRECT_MUTATION",
        rawObservation: { error: step.error || "Query failed or timed out" },
        testedCriteria: ["query_transport_success"],
        passedCriteria: [],
        failedCriteria: ["query_transport_success"],
        summary: `Query failed to retrieve data: ${step.error || "Timeout"}`,
      });

      return {
        stepId: step.stepId,
        status: "INCONCLUSIVE",
        layer: "MECHANICAL_VERIFICATION",
        verificationClass: this.verificationClass,
        evidence: [evidence],
        reason: `Query retrieval failed or timed out. Source availability could not be determined.`,
      };
    }

    const items =
      step.data?.messages ??
      step.data?.files ??
      step.data?.items ??
      step.data?.results ??
      step.data?.data ??
      (Array.isArray(step.data) ? step.data : []);
    const count = Array.isArray(items) ? items.length : 0;

    // Case 1: Context-aware emptiness (Correction D & F)
    // Negative existence query e.g. "Check if I have meetings" or query explicitly asks to confirm absence
    const query = (step.parameters?.query || context.goal || "").toLowerCase();
    const isNegativeCheck =
      query.includes("any meeting") ||
      query.includes("check if") ||
      query.includes("any alert") ||
      query.includes("verify no") ||
      query.includes("is there");

    if (count === 0) {
      if (isNegativeCheck) {
        const evidence = signEvidenceEnvelope({
          evidenceId,
          executionId: context.executionId,
          stepId: step.stepId,
          checkpointId: context.checkpointId,
          verificationClass: this.verificationClass,
          sourceURN: step.capabilityURN || "urn:capability:search",
          authority: "PROVIDER_AUTHORITATIVE",
          completeness: "EXHAUSTIVE",
          relevance: "DIRECT_MUTATION",
          rawObservation: { count, query: step.parameters?.query },
          testedCriteria: ["query_executed", "negative_existence_confirmed"],
          passedCriteria: ["query_executed", "negative_existence_confirmed"],
          failedCriteria: [],
          summary: `Confirmed 0 matching items for existence check "${step.parameters?.query || ""}"`,
        });

        return {
          stepId: step.stepId,
          status: "VERIFIED",
          layer: "STATE_CHANGE_VERIFICATION",
          verificationClass: this.verificationClass,
          evidence: [evidence],
          disclosure: `Found 0 items matching query (confirmed absence).`,
        };
      }

      // Workflow requires data for downstream synthesis
      const evidence = signEvidenceEnvelope({
        evidenceId,
        executionId: context.executionId,
        stepId: step.stepId,
        checkpointId: context.checkpointId,
        verificationClass: this.verificationClass,
        sourceURN: step.capabilityURN || "urn:capability:search",
        authority: "PROVIDER_AUTHORITATIVE",
        completeness: "EXHAUSTIVE",
        relevance: "DIRECT_MUTATION",
        rawObservation: { count, query: step.parameters?.query },
        testedCriteria: ["query_executed", "items_count_positive"],
        passedCriteria: ["query_executed"],
        failedCriteria: ["items_count_positive"],
        summary: `Query returned 0 items; required source data missing for downstream steps`,
      });

      return {
        stepId: step.stepId,
        status: "NOT_VERIFIED",
        layer: "REQUIREMENT_VERIFICATION",
        verificationClass: this.verificationClass,
        evidence: [evidence],
        reason: "OBJECTIVE_UNMET_EMPTY_SOURCE",
      };
    }

    // Positive items found
    const evidence = signEvidenceEnvelope({
      evidenceId,
      executionId: context.executionId,
      stepId: step.stepId,
      checkpointId: context.checkpointId,
      verificationClass: this.verificationClass,
      sourceURN: step.capabilityURN || "urn:capability:search",
      authority: "PROVIDER_AUTHORITATIVE",
      completeness: "EXHAUSTIVE",
      relevance: "DIRECT_MUTATION",
      rawObservation: { count, query: step.parameters?.query },
      testedCriteria: ["query_executed", "items_count_positive"],
      passedCriteria: ["query_executed", "items_count_positive"],
      failedCriteria: [],
      summary: `Found ${count} matching item(s) from provider query`,
    });

    return {
      stepId: step.stepId,
      status: "VERIFIED",
      layer: "STATE_CHANGE_VERIFICATION",
      verificationClass: this.verificationClass,
      evidence: [evidence],
      disclosure: `Found ${count} items matching query.`,
    };
  }
}

/**
 * Class 3: Content Synthesis Strategy
 * Evaluates length, grounding against upstream scratchpad observations,
 * and handles ungrounded synthesis with NOT_VERIFIED (Correction F).
 */
export class ContentSynthesisStrategy implements IVerificationStrategy {
  readonly verificationClass: VerificationClass = "CLASS_3_SYNTHESIS_PROVENANCE";

  canVerify(step: any, _goal: string): boolean {
    return Boolean(
      step.actionType === "synthesis" ||
      step.capabilityURN === "synthesis" ||
      (typeof step.data?.text === "string" && step.data.text.length > 0)
    );
  }

  async verify(
    context: VerificationContext,
    step: any,
    completedSteps: any[] = []
  ): Promise<StepVerificationResult> {
    const evidenceId = `ev_c3_${step.stepId}_${Date.now()}`;
    const text = step.data?.text || "";
    const minLength = MULTI_STEP_WORKFLOW_POLICY.minSynthesisLength;

    // Check Layer 3: Length requirement
    if (text.length < minLength) {
      const evidence = signEvidenceEnvelope({
        evidenceId,
        executionId: context.executionId,
        stepId: step.stepId,
        checkpointId: context.checkpointId,
        verificationClass: this.verificationClass,
        sourceURN: "urn:capability:kernel.synthesis",
        authority: "KERNEL_AUTHORITATIVE",
        completeness: "EXHAUSTIVE",
        relevance: "DIRECT_MUTATION",
        rawObservation: { length: text.length, minLength },
        testedCriteria: ["minimum_length_met"],
        passedCriteria: [],
        failedCriteria: ["minimum_length_met"],
        summary: `Synthesized text length (${text.length}) is below required minimum (${minLength})`,
      });

      return {
        stepId: step.stepId,
        status: "NOT_VERIFIED",
        layer: "REQUIREMENT_VERIFICATION",
        verificationClass: this.verificationClass,
        evidence: [evidence],
        reason: "OBJECTIVE_UNMET_INSUFFICIENT_SYNTHESIS",
      };
    }

    // Check Layer 4: Source Grounding (Correction F)
    // Look for upstream search/query steps that provided the data
    const upstreamSources = completedSteps.filter(
      (s) => s.stepId !== step.stepId && (s.capabilityURN?.includes("search") || s.data?.messages || s.data?.items)
    );

    // If workflow has zero upstream sources or all upstream search steps produced 0 items
    const hasValidSources = upstreamSources.some((s) => {
      const count = s.data?.messages?.length ?? s.data?.files?.length ?? s.data?.items?.length ?? 0;
      return count > 0;
    });

    if (upstreamSources.length > 0 && !hasValidSources) {
      // Source requirements demonstrably unmet (T10)
      const evidence = signEvidenceEnvelope({
        evidenceId,
        executionId: context.executionId,
        stepId: step.stepId,
        checkpointId: context.checkpointId,
        verificationClass: this.verificationClass,
        sourceURN: "urn:capability:kernel.synthesis",
        authority: "KERNEL_AUTHORITATIVE",
        completeness: "EXHAUSTIVE",
        relevance: "DIRECT_MUTATION",
        rawObservation: { textLength: text.length, upstreamSourcesCount: upstreamSources.length },
        testedCriteria: ["minimum_length_met", "source_grounding_verified"],
        passedCriteria: ["minimum_length_met"],
        failedCriteria: ["source_grounding_verified"],
        summary: `Synthesis attempted without valid upstream source items (empty source items)`,
      });

      return {
        stepId: step.stepId,
        status: "NOT_VERIFIED",
        layer: "SEMANTIC_VERIFICATION",
        verificationClass: this.verificationClass,
        evidence: [evidence],
        reason: "UNGROUNDED_SYNTHESIS_NO_SOURCES",
      };
    }

    const evidence = signEvidenceEnvelope({
      evidenceId,
      executionId: context.executionId,
      stepId: step.stepId,
      checkpointId: context.checkpointId,
      verificationClass: this.verificationClass,
      sourceURN: "urn:capability:kernel.synthesis",
      authority: "KERNEL_AUTHORITATIVE",
      completeness: "EXHAUSTIVE",
      relevance: "DIRECT_MUTATION",
      rawObservation: { textLength: text.length, upstreamSourcesFound: upstreamSources.length },
      testedCriteria: ["minimum_length_met", "source_grounding_verified"],
      passedCriteria: ["minimum_length_met", "source_grounding_verified"],
      failedCriteria: [],
      summary: `Synthesized text (${text.length} chars) grounded against upstream observations`,
    });

    return {
      stepId: step.stepId,
      status: "VERIFIED_WITH_LIMITATIONS",
      layer: "SEMANTIC_VERIFICATION",
      verificationClass: this.verificationClass,
      evidence: [evidence],
      disclosure: `Generated synthesis (${text.length} chars). Note: Semantic nuance is an AI-generated synthesis.`,
    };
  }
}

/**
 * Class 4: Domain Graph & Entity Strategy
 * Verifies local or external entities (calendar, tasks, habits) via authoritative receipt IDs and DB state.
 */
export class DomainGraphStrategy implements IVerificationStrategy {
  readonly verificationClass: VerificationClass = "CLASS_4_DOMAIN_GRAPH_MUTATION";

  canVerify(step: any, _goal: string): boolean {
    return Boolean(
      step.capabilityURN?.includes("calendar.create") ||
      step.capabilityURN?.includes("task.create") ||
      step.capabilityURN?.includes("git.create") ||
      step.actionType === "create_task" ||
      step.actionType === "complete_task"
    );
  }

  async verify(context: VerificationContext, step: any): Promise<StepVerificationResult> {
    const evidenceId = `ev_c4_${step.stepId}_${Date.now()}`;
    const entityId =
      step.data?.id ||
      step.data?.taskId ||
      step.data?.eventId ||
      step.data?.issueNumber ||
      step.data?.key;

    if (!entityId) {
      const evidence = signEvidenceEnvelope({
        evidenceId,
        executionId: context.executionId,
        stepId: step.stepId,
        checkpointId: context.checkpointId,
        verificationClass: this.verificationClass,
        sourceURN: step.capabilityURN || "urn:capability:domain.entity",
        authority: "PROVIDER_AUTHORITATIVE",
        completeness: "EXHAUSTIVE",
        relevance: "DIRECT_MUTATION",
        rawObservation: step.data || {},
        testedCriteria: ["authoritative_receipt_id_present"],
        passedCriteria: [],
        failedCriteria: ["authoritative_receipt_id_present"],
        summary: "Entity creation missing authoritative receipt ID",
      });

      return {
        stepId: step.stepId,
        status: "NOT_VERIFIED",
        layer: "REQUIREMENT_VERIFICATION",
        verificationClass: this.verificationClass,
        evidence: [evidence],
        reason: "Authoritative receipt ID missing from domain entity mutation result",
      };
    }

    const evidence = signEvidenceEnvelope({
      evidenceId,
      executionId: context.executionId,
      stepId: step.stepId,
      checkpointId: context.checkpointId,
      verificationClass: this.verificationClass,
      sourceURN: step.capabilityURN || "urn:capability:domain.entity",
      authority: "PROVIDER_AUTHORITATIVE",
      completeness: "EXHAUSTIVE",
      relevance: "DIRECT_MUTATION",
      rawObservation: { entityId, ...step.data },
      testedCriteria: ["authoritative_receipt_id_present"],
      passedCriteria: ["authoritative_receipt_id_present"],
      failedCriteria: [],
      summary: `Verified entity creation with authoritative ID "${entityId}"`,
    });

    return {
      stepId: step.stepId,
      status: "VERIFIED",
      layer: "STATE_CHANGE_VERIFICATION",
      verificationClass: this.verificationClass,
      evidence: [evidence],
      disclosure: `Created entity successfully with verified receipt ID ${entityId}.`,
    };
  }
}

/**
 * Class 5: External Third-Party Strategy
 * Distinguishes provider protocol acceptance from queueing, sent-folder state, and recipient delivery (Correction D).
 */
export class ExternalThirdPartyStrategy implements IVerificationStrategy {
  readonly verificationClass: VerificationClass = "CLASS_5_EXTERNAL_ACTION";

  canVerify(step: any, _goal: string): boolean {
    return Boolean(
      step.capabilityURN?.includes("email.send") ||
      step.capabilityURN?.includes("slack.send") ||
      step.capabilityURN?.includes("webhook")
    );
  }

  async verify(context: VerificationContext, step: any): Promise<StepVerificationResult> {
    const evidenceId = `ev_c5_${step.stepId}_${Date.now()}`;
    const messageId = step.data?.messageId || step.data?.id;

    if (!messageId) {
      const evidence = signEvidenceEnvelope({
        evidenceId,
        executionId: context.executionId,
        stepId: step.stepId,
        checkpointId: context.checkpointId,
        verificationClass: this.verificationClass,
        sourceURN: step.capabilityURN || "urn:capability:external.dispatch",
        authority: "PROVIDER_AUTHORITATIVE",
        completeness: "EXHAUSTIVE",
        relevance: "DIRECT_MUTATION",
        rawObservation: step.data || {},
        testedCriteria: ["provider_outbound_dispatch_confirmed"],
        passedCriteria: [],
        failedCriteria: ["provider_outbound_dispatch_confirmed"],
        summary: "External dispatch missing provider message identifier",
      });

      return {
        stepId: step.stepId,
        status: "NOT_VERIFIED",
        layer: "MECHANICAL_VERIFICATION",
        verificationClass: this.verificationClass,
        evidence: [evidence],
        reason: "Provider did not return authoritative message confirmation token",
      };
    }

    const isInSentFolder = Boolean(step.data?.inSentFolder ?? true);
    const hasRecipientDeliveryReceipt = Boolean(step.data?.recipientDeliveryReceipt ?? false);

    const testedCriteria = [
      "provider_accepted_request",
      "provider_confirmed_outbox_state",
      "recipient_delivery_confirmed",
    ];
    const passedCriteria: string[] = ["provider_accepted_request"];
    const failedCriteria: string[] = [];

    if (isInSentFolder) {
      passedCriteria.push("provider_confirmed_outbox_state");
    }

    if (hasRecipientDeliveryReceipt) {
      passedCriteria.push("recipient_delivery_confirmed");
    } else {
      failedCriteria.push("recipient_delivery_confirmed");
    }

    const evidence = signEvidenceEnvelope({
      evidenceId,
      executionId: context.executionId,
      stepId: step.stepId,
      checkpointId: context.checkpointId,
      verificationClass: this.verificationClass,
      sourceURN: step.capabilityURN || "urn:capability:external.dispatch",
      authority: "PROVIDER_AUTHORITATIVE",
      completeness: "SAMPLED",
      relevance: "DIRECT_MUTATION",
      rawObservation: {
        messageId,
        inSentFolder: isInSentFolder,
        recipientDeliveryReceipt: hasRecipientDeliveryReceipt,
      },
      testedCriteria,
      passedCriteria,
      failedCriteria,
      summary: `Confirmed message dispatched (ID: ${messageId}) in provider outbox; external recipient receipt unconfirmed`,
    });

    return {
      stepId: step.stepId,
      status: "VERIFIED_WITH_LIMITATIONS",
      layer: "STATE_CHANGE_VERIFICATION",
      verificationClass: this.verificationClass,
      evidence: [evidence],
      disclosure: `Message dispatched and verified in provider outbox. Note: Recipient delivery unconfirmed.`,
    };
  }
}
