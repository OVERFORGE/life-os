import { connectDB } from "@/server/db/connect";
import { Goal } from "@/features/goals/models/Goal";
import { GoalStats } from "@/features/goals/models/GoalStats";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { analyzeGoalPressure } from "@/features/goals/engine/analyzeGoalPressure";
import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";
import { getAuthSession } from "@/lib/auth";
import { LifeSettings } from "@/features/insights/models/LifeSettings";
import mongoose from "mongoose";

function getUserIdMatcher(userId: string) {
  const matchers: any[] = [userId, String(userId)];
  if (mongoose.Types.ObjectId.isValid(userId)) {
    matchers.push(new mongoose.Types.ObjectId(userId));
  }
  return { $in: matchers };
}

function getDefaultMilestonesForGoal(title: string) {
  const t = title.toLowerCase();
  if (t.includes("lifeos") || t.includes("infra") || t.includes("code") || t.includes("sync") || t.includes("devops")) {
    return [
      { milestoneId: "m1", title: "Local core engine & schema contracts", completed: true, order: 0 },
      { milestoneId: "m2", title: "State checkpoint pipeline validation", completed: true, order: 1 },
      { milestoneId: "m3", title: "Multi-node distributed stress testing", completed: false, order: 2 },
      { milestoneId: "m4", title: "Production deployment & monitoring", completed: false, order: 3 },
    ];
  }
  if (t.includes("fit") || t.includes("health") || t.includes("gym") || t.includes("routine")) {
    return [
      { milestoneId: "m1", title: "Consistent morning cadence & workout logging", completed: true, order: 0 },
      { milestoneId: "m2", title: "Midday cognitive pacing and outdoor break", completed: false, order: 1 },
      { milestoneId: "m3", title: "Cardio baseline & evening ritual consistency", completed: false, order: 2 },
    ];
  }
  if (t.includes("product") || t.includes("release") || t.includes("crypto") || t.includes("trading") || t.includes("learn")) {
    return [
      { milestoneId: "m1", title: "Foundational framework & market study", completed: true, order: 0 },
      { milestoneId: "m2", title: "Private usability trial with 20 builders", completed: false, order: 1 },
      { milestoneId: "m3", title: "Public beta documentation and onboarding", completed: false, order: 2 },
    ];
  }
  return [
    { milestoneId: "m1", title: "Initial roadmap & requirement definition", completed: true, order: 0 },
    { milestoneId: "m2", title: "Core execution & iterative testing", completed: false, order: 1 },
    { milestoneId: "m3", title: "Review, evaluation and sign-off", completed: false, order: 2 },
  ];
}

function getDefaultTargetDateForIndex(index: number) {
  const dates = ["Target Nov 04", "Target Mid-Nov", "Target Nov 20", "Target Dec 01", "Target Dec 15", "Target Jan 10"];
  return dates[index % dates.length];
}

const THEMES = [
  { text: "text-[#ffb86c]", border: "border-[#D98B2B]/40", bg: "bg-[#ffb86c]/10", dot: "bg-[#ffb86c]", hex: "#ffb86c" },
  { text: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10", dot: "bg-emerald-400", hex: "#34d399" },
  { text: "text-blue-300", border: "border-blue-500/40", bg: "bg-blue-500/10", dot: "bg-blue-400", hex: "#60a5fa" },
];

export async function GET() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return Response.json([], { status: 401 });
  }

  await connectDB();
  const userId = session.user.id;

  const goals = await Goal.find({
    userId: getUserIdMatcher(userId),
    status: { $ne: "archived" },
  }).sort({ updatedAt: -1 }).lean();

  const goalIds = goals.map((g) => g._id);

  const stats = await GoalStats.find({
    goalId: { $in: goalIds },
  }).lean();

  const statMap = new Map(stats.map((s) => [String(s.goalId), s]));

  const settings = await LifeSettings.findOne({
    userId: getUserIdMatcher(userId),
  }).lean();

  const weights =
    settings?.goalPressureWeights ?? {
      cadence: 0.25,
      energy: 0.25,
      stress: 0.25,
      phaseMismatch: 0.25,
    };

  const currentPhase = await PhaseHistory.findOne({
    userId: getUserIdMatcher(userId),
  })
    .sort({ createdAt: -1 })
    .lean();

  const phaseExplanation = currentPhase
    ? {
      ...explainLifePhase(currentPhase),
      phase: currentPhase.phase,
    }
    : null;

  const result = goals.map((g: any, index: number) => {
    const goalStats = statMap.get(String(g._id));

    const pressure = phaseExplanation
      ? analyzeGoalPressure({
        goal: g,
        stats: goalStats,
        phase: phaseExplanation,
        weights,
      })
      : null;

    // Use existing milestones or smart defaults
    let milestones = Array.isArray(g.milestones) && g.milestones.length > 0
      ? g.milestones
      : getDefaultMilestonesForGoal(g.title || "Goal");

    const completedMilestones = milestones.filter((m: any) => m.completed).length;
    const totalMilestones = milestones.length;

    // Determine current & next milestone
    const uncompleted = milestones.filter((m: any) => !m.completed);
    const currentMilestone = uncompleted[0]?.title || milestones[milestones.length - 1]?.title || "In active progress";
    const nextMilestone = uncompleted[1]?.title || (uncompleted.length === 1 ? "Final milestone delivery & verification" : "Cadence review & next sprint planning");

    // Formatted target date
    let targetDateStr = getDefaultTargetDateForIndex(index);
    if (g.targetCompletionDate) {
      const d = new Date(g.targetCompletionDate);
      if (!isNaN(d.getTime())) {
        targetDateStr = `Target ${d.toLocaleDateString("en-US", { month: "short", day: "2-digit" })}`;
      }
    }

    // Horizon
    const horizon = g.horizon || (index % 3 === 0 ? "3 Months" : index % 3 === 1 ? "1 Year" : "6 Months");

    // Theme color palette
    const theme = THEMES[index % THEMES.length];

    return {
      ...g,
      id: g._id.toString(),
      horizon,
      milestones,
      completedMilestones,
      totalMilestones,
      currentMilestone,
      nextMilestone,
      targetDateStr,
      theme,
      stats: goalStats ?? null,
      pressure: pressure
        ? {
          status: pressure.status,
          score: pressure.pressureScore,
        }
        : null,
    };
  });

  return Response.json(result);
}
