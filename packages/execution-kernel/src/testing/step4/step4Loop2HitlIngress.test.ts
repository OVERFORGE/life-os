import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  HITLGovernanceEngine,
  TamperedInterventionError,
  ExpiredInterventionError,
  InvalidInterventionStateError,
  RetiredKeyVersionError,
} from "../../autonomous/HITLGovernanceEngine";

class MockInterventionModel {
  public docs: Map<string, any> = new Map();

  async findOne(query: Record<string, any>): Promise<any> {
    for (const doc of this.docs.values()) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        if (doc[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) return JSON.parse(JSON.stringify(doc));
    }
    return null;
  }

  async create(doc: any): Promise<any> {
    const id = doc.interventionId;
    const saved = JSON.parse(JSON.stringify({ _id: `id_${Date.now()}_${Math.random()}`, ...doc }));
    this.docs.set(id, saved);
    return saved;
  }

  async updateOne(filter: Record<string, any>, update: any, _opts?: any): Promise<{ matchedCount: number; modifiedCount: number }> {
    for (const [id, doc] of this.docs.entries()) {
      let match = true;
      for (const [k, v] of Object.entries(filter)) {
        if (k === "expiresAt" && v && v.$gt) {
          if (new Date(doc.expiresAt).getTime() <= new Date(v.$gt).getTime()) {
            match = false;
            break;
          }
        } else if (doc[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) {
        if (update.$set) Object.assign(doc, update.$set);
        if (update.$inc) {
          for (const [field, incVal] of Object.entries(update.$inc)) {
            doc[field] = (doc[field] || 0) + (incVal as number);
          }
        }
        this.docs.set(id, doc);
        return { matchedCount: 1, modifiedCount: 1 };
      }
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }
}

class MockOutboxModel {
  public events: Map<string, any> = new Map();

  async create(docs: any | any[], _opts?: any): Promise<any> {
    const arr = Array.isArray(docs) ? docs : [docs];
    const created = arr.map((item) => {
      const saved = JSON.parse(JSON.stringify({ _id: `outbox_${Date.now()}_${Math.random()}`, ...item }));
      this.events.set(item.eventId, saved);
      return saved;
    });
    return Array.isArray(docs) ? created : created[0];
  }

  async findOne(query: Record<string, any>): Promise<any> {
    for (const evt of this.events.values()) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        if (evt[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) return JSON.parse(JSON.stringify(evt));
    }
    return null;
  }

  async updateOne(filter: Record<string, any>, update: any): Promise<{ matchedCount: number; modifiedCount: number }> {
    for (const [id, evt] of this.events.entries()) {
      let match = true;
      for (const [k, v] of Object.entries(filter)) {
        if (evt[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) {
        if (update.$set) Object.assign(evt, update.$set);
        if (update.$inc) {
          for (const [field, incVal] of Object.entries(update.$inc)) {
            evt[field] = (evt[field] || 0) + (incVal as number);
          }
        }
        if (update.$unset) {
          for (const field of Object.keys(update.$unset)) {
            delete evt[field];
          }
        }
        this.events.set(id, evt);
        return { matchedCount: 1, modifiedCount: 1 };
      }
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }
}

describe("Step 4 Loop 2: HITL Cryptographic Governance Ingress & DIMIP Fencing", () => {
  let interventionModel: MockInterventionModel;
  let outboxModel: MockOutboxModel;
  let engine: HITLGovernanceEngine;
  const SECRET_KEY_V1 = "secret-key-v1-super-secure-production-32b";
  const SECRET_KEY_V2 = "secret-key-v2-super-secure-production-32b";

  beforeEach(() => {
    interventionModel = new MockInterventionModel();
    outboxModel = new MockOutboxModel();
    engine = new HITLGovernanceEngine({
      interventionModel,
      outboxModel,
      secretKey: SECRET_KEY_V1,
      activeKeyVersion: 1,
      workerId: "hitl_test_worker",
    });
  });

  it("test_hitl_timing_safe_equal_tamper_rejection: valid signature accepted, altered signature rejected with TamperedInterventionError", async () => {
    const intervention = await engine.createIntervention({
      userId: "user_alice",
      actionId: "act_001",
      autonomyLevel: "L2",
      domain: "productivity",
      proposal: { taskTitle: "Schedule doctor appointment" },
    });

    // Valid response
    const validRes = await engine.respondIntervention({
      interventionId: intervention.interventionId,
      userId: "user_alice",
      response: "ACCEPTED",
      signature: intervention.signature,
    });

    assert.equal(validRes.status, "ACCEPTED");

    // Altered signature on new intervention
    const intervention2 = await engine.createIntervention({
      userId: "user_alice",
      actionId: "act_002",
      autonomyLevel: "L2",
      domain: "productivity",
      proposal: { taskTitle: "Pay taxes" },
    });

    const tamperedSig = intervention2.signature.slice(0, -2) + "ff";

    await assert.rejects(
      async () => {
        await engine.respondIntervention({
          interventionId: intervention2.interventionId,
          userId: "user_alice",
          response: "ACCEPTED",
          signature: tamperedSig,
        });
      },
      TamperedInterventionError,
      "Must throw TamperedInterventionError when signature byte is altered"
    );
  });

  it("test_hitl_length_mismatch_rejection: length pre-check rejects malformed signatures cleanly", async () => {
    const intervention = await engine.createIntervention({
      userId: "user_alice",
      actionId: "act_003",
      autonomyLevel: "L2",
      domain: "productivity",
      proposal: { taskTitle: "Short signature check" },
    });

    // Short signature (62 chars instead of 64)
    const shortSig = intervention.signature.slice(0, 62);

    await assert.rejects(
      async () => {
        await engine.respondIntervention({
          interventionId: intervention.interventionId,
          userId: "user_alice",
          response: "ACCEPTED",
          signature: shortSig,
        });
      },
      TamperedInterventionError,
      "Must reject mismatched length signatures before calling timingSafeEqual"
    );
  });

  it("test_hitl_key_rotation_validation: token signed under v1 remains valid after rotating to v2 when v1 is retained", async () => {
    // Created under key v1
    const intervention = await engine.createIntervention({
      userId: "user_bob",
      actionId: "act_rotate",
      autonomyLevel: "L2",
      domain: "productivity",
      proposal: { taskTitle: "Rotate key test" },
    });

    // Rotate active key to v2, retaining v1 in history
    engine.rotateKey(2, SECRET_KEY_V2);

    // Verify response using keyVersion 1
    const res = await engine.respondIntervention({
      interventionId: intervention.interventionId,
      userId: "user_bob",
      response: "ACCEPTED",
      signature: intervention.signature,
      keyVersion: 1,
    });

    assert.equal(res.status, "ACCEPTED");
  });

  it("test_hitl_retired_key_rejection: tokens signed with explicitly retired keys throw RetiredKeyVersionError", async () => {
    const intervention = await engine.createIntervention({
      userId: "user_bob",
      actionId: "act_retired",
      autonomyLevel: "L2",
      domain: "productivity",
      proposal: { taskTitle: "Retire key test" },
    });

    // Retire key version 1
    engine.retireKeyVersion(1);

    await assert.rejects(
      async () => {
        await engine.respondIntervention({
          interventionId: intervention.interventionId,
          userId: "user_bob",
          response: "ACCEPTED",
          signature: intervention.signature,
          keyVersion: 1,
        });
      },
      RetiredKeyVersionError,
      "Must throw RetiredKeyVersionError when key is explicitly retired"
    );
  });

  it("test_hitl_mode_b_dimip_atomicity: creates PENDING_COMMIT outbox event, updates intervention, and promotes to PENDING", async () => {
    const intervention = await engine.createIntervention({
      userId: "user_mode_b",
      actionId: "act_dimip_1",
      autonomyLevel: "L2",
      domain: "productivity",
      proposal: { taskTitle: "DIMIP Mode B Test" },
    });

    assert.equal(intervention.mutationEpoch, 1);

    const res = await engine.respondIntervention({
      interventionId: intervention.interventionId,
      userId: "user_mode_b",
      response: "ACCEPTED",
      signature: intervention.signature,
    });

    assert.equal(res.status, "ACCEPTED");
    assert.equal(res.mutationEpoch, 2, "Mutation epoch must increment monotonically on intervention update");

    // Verify outbox event was promoted to PENDING
    const outboxEvt = await outboxModel.findOne({
      userId: "user_mode_b",
      aggregateId: intervention.interventionId,
    });

    assert.ok(outboxEvt, "Outbox event must be persisted");
    assert.equal(outboxEvt.deliveryStatus, "PENDING", "Outbox event must be promoted to PENDING");
    assert.equal(outboxEvt.type, "domain.intervention.responded");
  });

  it("test_hitl_delayed_worker_epoch_burn_fencing: sweeper epoch burn fences out delayed worker CAS cleanly", async () => {
    // 1. Create intervention at epoch 1
    const intervention = await engine.createIntervention({
      userId: "user_delayed",
      actionId: "act_delayed_1",
      autonomyLevel: "L2",
      domain: "productivity",
      proposal: { taskTitle: "Delayed Worker Race" },
    });

    // 2. Worker stages outbox event in PENDING_COMMIT with expired lease (simulating extreme stall)
    const eventId = "evt_delayed_stalled";
    await outboxModel.create({
      eventId,
      userId: "user_delayed",
      category: "DOMAIN_EVENT",
      type: "domain.intervention.responded",
      aggregateId: intervention.interventionId,
      deliveryStatus: "PENDING_COMMIT",
      leasedByWorkerId: "delayed_worker_1",
      leaseExpiresAt: new Date(Date.now() - 5000), // Expired!
      leaseGeneration: 1,
      mutationIntent: {
        clientMutationId: `hitl_${intervention.interventionId}_ACCEPTED`,
        fencingEpoch: 1,
      },
    });

    // 3. Sweeper wakes up and reconciles stalled intent
    const stalledIntent = await outboxModel.findOne({ eventId });
    const sweepResult = await engine.reconcileStalledDimipIntent(stalledIntent);

    assert.equal(sweepResult, "ABORTED", "Sweeper must burn epoch and abort outbox event");

    // Verify outbox event is marked ABORTED
    const abortedOutbox = await outboxModel.findOne({ eventId });
    assert.equal(abortedOutbox.deliveryStatus, "ABORTED");

    // Verify intervention mutationEpoch was burned (1 -> 2) while status remains PENDING
    const currentIntervention = await interventionModel.findOne({ interventionId: intervention.interventionId });
    assert.equal(currentIntervention.mutationEpoch, 2, "Sweeper must have incremented mutationEpoch");
    assert.equal(currentIntervention.status, "PENDING");

    // 4. Delayed worker resumes and attempts its CAS conditional on mutationEpoch: 1
    // The engine's respondIntervention will see intervention.mutationEpoch === 2
    // If worker tried direct CAS with epoch 1, it matches 0 docs!
    const delayedWorkerCasResult = await interventionModel.updateOne(
      {
        interventionId: intervention.interventionId,
        userId: "user_delayed",
        status: "PENDING",
        mutationEpoch: 1, // Stale epoch!
      },
      {
        $set: { status: "ACCEPTED" },
      }
    );

    assert.equal(delayedWorkerCasResult.matchedCount, 0, "Delayed worker CAS must match 0 docs because epoch was burned!");
  });

  it("test_hitl_rejects_expired_interventions: throws ExpiredInterventionError", async () => {
    // Create intervention expired 1 hour ago
    const intervention = await engine.createIntervention({
      userId: "user_exp",
      actionId: "act_exp",
      autonomyLevel: "L2",
      domain: "productivity",
      proposal: { taskTitle: "Expired Action" },
      ttlMs: -3600000, // Negative TTL
    });

    await assert.rejects(
      async () => {
        await engine.respondIntervention({
          interventionId: intervention.interventionId,
          userId: "user_exp",
          response: "ACCEPTED",
          signature: intervention.signature,
        });
      },
      ExpiredInterventionError
    );
  });
});

