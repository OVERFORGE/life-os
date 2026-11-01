/**
 * PublicationEligibilityGate.ts
 * 
 * LifeOS Step 3 V2.2 — Application Delivery Integration
 * Hard correctness barrier preventing dirty-read invalidations.
 * Enforces set-theoretic consumer convergence and outbox completion
 * prior to client delivery publication.
 */

import { IOutboxEventDoc } from "../../../../../apps/web/server/db/models/OutboxEventModel";
import { ConsumerProcessingLedgerModel } from "../../../../../apps/web/server/db/models/ConsumerProcessingLedgerModel";
import {
  isCanonicalEventType,
  getDeliveryDefinition,
} from "./CanonicalDeliveryRegistry";

export interface PublicationEligibilityDependencies {
  ledgerModel?: any;
  outboxModel?: any;
}

export interface FailedConsumerDetail {
  consumerName: string;
  status: string;
  error?: string | null;
}

export interface PublicationEligibilityResult {
  eligible: boolean;
  eventId: string;
  userId: string;
  eventType: string;
  reason?: string;
  missingConsumers?: string[];
  failedConsumers?: FailedConsumerDetail[];
}

async function resolveQuery<T = any>(queryOrPromise: any): Promise<T> {
  if (!queryOrPromise) return queryOrPromise;
  if (typeof queryOrPromise.lean === "function") {
    return await queryOrPromise.lean();
  }
  return await queryOrPromise;
}

export class PublicationEligibilityGate {
  private ledgerModel: any;
  private outboxModel: any;

  constructor(deps?: PublicationEligibilityDependencies) {
    this.ledgerModel = deps?.ledgerModel || ConsumerProcessingLedgerModel;
    this.outboxModel = deps?.outboxModel;
  }

  /**
   * Asserts whether an outbox event is eligible for wire publication to client runtimes.
   * Enforces:
   * 1. Authoritative canonical event identity.
   * 2. Outbox deliveryStatus is strictly "DELIVERED".
   * 3. Set-theoretic subset: Req(E) <= Succeeded(E).
   * 4. Zero terminal or retryable failures among required consumers.
   */
  public async evaluateEligibility(
    event: Partial<IOutboxEventDoc> | any
  ): Promise<PublicationEligibilityResult> {
    const eventId = String(event.eventId || event._id || "");
    const userId = String(event.userId || "");
    const eventType = String(event.type || "");

    const baseResult = {
      eventId,
      userId,
      eventType,
    };

    if (!eventId || !userId) {
      return {
        ...baseResult,
        eligible: false,
        reason: "Event missing required eventId or userId",
      };
    }

    // 1. Authoritative canonical event registration check
    if (!isCanonicalEventType(eventType)) {
      return {
        ...baseResult,
        eligible: false,
        reason: `Unregistered canonical event type: '${eventType}'. Zero fallback permitted.`,
      };
    }

    // 2. Outbox status verification (must be DELIVERED)
    const outboxStatus = event.deliveryStatus;
    if (outboxStatus !== "DELIVERED") {
      return {
        ...baseResult,
        eligible: false,
        reason: `Outbox deliveryStatus is '${outboxStatus}', expected strictly 'DELIVERED'.`,
      };
    }

    // 3. Required consumers lookup
    const deliveryDef = getDeliveryDefinition(eventType);
    const requiredConsumers = deliveryDef.requiredConsumers;

    // Events with zero required consumers are immediately eligible upon outbox DELIVERED
    if (requiredConsumers.length === 0) {
      return {
        ...baseResult,
        eligible: true,
      };
    }

    // 4. Fetch durable consumer processing ledgers for this specific event
    const query = this.ledgerModel.find({
      userId,
      eventId,
    });
    const ledgers: any[] = (await resolveQuery(query)) || [];

    const succeededConsumers = new Set<string>();
    const failedConsumers: FailedConsumerDetail[] = [];

    for (const ledger of ledgers) {
      const cName = ledger.consumerName;
      const status = ledger.status;

      if (status === "SUCCEEDED" || status === "SKIPPED_STALE") {
        succeededConsumers.add(cName);
      } else if (
        status === "FAILED_TERMINAL" ||
        status === "FAILED_RETRYABLE" ||
        status === "PENDING_RETRY"
      ) {
        failedConsumers.push({
          consumerName: cName,
          status,
          error: ledger.errorDetails || null,
        });
      }
    }

    // If any required consumer has recorded a failure, publication is strictly blocked
    const activeFailedRequired = failedConsumers.filter((f) =>
      requiredConsumers.includes(f.consumerName)
    );
    if (activeFailedRequired.length > 0) {
      return {
        ...baseResult,
        eligible: false,
        reason: `Required consumer(s) failed convergence: ${activeFailedRequired
          .map((f) => `${f.consumerName} (${f.status})`)
          .join(", ")}`,
        failedConsumers: activeFailedRequired,
      };
    }

    // 5. Set-Theoretic Completeness: Req(E) <= Succeeded(E)
    const missingConsumers: string[] = [];
    for (const required of requiredConsumers) {
      if (!succeededConsumers.has(required)) {
        missingConsumers.push(required);
      }
    }

    if (missingConsumers.length > 0) {
      return {
        ...baseResult,
        eligible: false,
        reason: `Required consumer ledger records missing or incomplete: ${missingConsumers.join(
          ", "
        )}`,
        missingConsumers,
      };
    }

    return {
      ...baseResult,
      eligible: true,
    };
  }
}

