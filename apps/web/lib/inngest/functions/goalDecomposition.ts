import { inngest } from "../client";
import { Goal } from "@/features/goals/models/Goal";
import { OutboxStorageService } from "@life-os/execution-kernel";
import { connectDB } from "@/server/db/connect";

export const goalDecompositionFunction = inngest.createFunction(
  {
    id: "goal-decomposition-saga",
    name: "Goal Decomposition Saga",
    retries: 3,
    triggers: [{ event: "lifeos/goal.decompose" }],
  },
  async ({ event, step }: { event: any; step: any }) => {
    const { goalId, userId, expectedEpoch } = event.data;

    // Step 1: Fetch goal context and verify baseline epoch
    const goalContext = await step.run("fetch-goal-context", async () => {
      await connectDB();
      const goalDoc = (await Goal.findById(goalId).lean()) as any;
      if (!goalDoc) {
        return { exists: false, reason: "NOT_FOUND" };
      }
      if (goalDoc.status === "archived" || goalDoc.status === "completed") {
        return { exists: true, active: false, reason: "INACTIVE" };
      }
      return {
        exists: true,
        active: true,
        id: String(goalDoc._id),
        title: goalDoc.title || "Goal",
        description: goalDoc.description || "",
        currentVersion: goalDoc.version ?? 0,
        currentEpoch: goalDoc.mutationEpoch ?? 0,
        milestones: goalDoc.milestones || [],
      };
    });

    if (!goalContext.exists || !goalContext.active) {
      return { status: "SKIPPED", reason: goalContext.reason };
    }

    // Step 2: Generate decomposition proposal
    const proposal = await step.run("generate-decomposition-proposal", async () => {
      const baseTitle = goalContext.title || "Goal";
      const proposedMilestones = [
        {
          milestoneId: `ms_${goalId}_phase1`,
          title: `Initiate & Plan: ${baseTitle}`,
          order: 1,
          completed: false,
        },
        {
          milestoneId: `ms_${goalId}_phase2`,
          title: `Core Execution: ${baseTitle}`,
          order: 2,
          completed: false,
        },
        {
          milestoneId: `ms_${goalId}_phase3`,
          title: `Review & Complete: ${baseTitle}`,
          order: 3,
          completed: false,
        },
      ];

      return {
        goalId,
        milestones: proposedMilestones,
      };
    });

    // Step 3: DWCP Anti-Overwrite Verification and Atomic Commit
    const commitResult = await step.run("verify-epoch-and-commit", async () => {
      await connectDB();
      const currentGoal = await Goal.findById(goalId);
      if (!currentGoal) {
        return { committed: false, reason: "GOAL_DELETED" };
      }

      // DWCP Epoch Check: Detect concurrent mutations
      if (currentGoal.mutationEpoch > expectedEpoch) {
        return {
          committed: false,
          reason: "FENCED_OUT_CONCURRENT_MUTATION",
          currentEpoch: currentGoal.mutationEpoch,
          expectedEpoch,
        };
      }

      // Do not overwrite existing milestones if already populated
      if (currentGoal.milestones && currentGoal.milestones.length > 0) {
        return { committed: false, reason: "MILESTONES_ALREADY_EXIST" };
      }

      const outboxService = OutboxStorageService.getInstance();
      const nextEpoch = (currentGoal.mutationEpoch || 0) + 1;
      const clientMutationId = `decomp_${goalId}_${Date.now()}`;

      const res = await outboxService.persistWithStandaloneFencing({
        userId,
        aggregateModel: Goal,
        aggregateId: goalId,
        clientMutationId,
        diffHash: `hash_decomp_${goalId}_epoch_${nextEpoch}`,
        expectedVersion: currentGoal.version ?? 0,
        fencingEpoch: nextEpoch,
        domainUpdates: {
          milestones: proposal.milestones,
          remediationReason: "AUTOMATED_DECOMPOSITION_COMPLETE",
        },
        eventDrafts: [
          {
            userId,
            category: "DOMAIN_EVENT",
            type: "GOAL_DECOMPOSED",
            aggregateId: goalId,
            aggregateType: "goal",
            aggregateVersion: (currentGoal.version ?? 0) + 1,
            source: "inngest_goal_decomposition_saga",
            payload: {
              goalId,
              milestoneCount: proposal.milestones.length,
            },
          },
        ],
      });

      return {
        committed: res.success,
        newVersion: (currentGoal.version ?? 0) + 1,
        epoch: nextEpoch,
      };
    });

    return commitResult;
  }
);
