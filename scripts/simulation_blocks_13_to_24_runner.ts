import "dotenv/config";
import fs from "fs";
import path from "path";
import { PERSONAS, PersonaProfile, TurnExecutionRecord } from "./simulation_180d_runner";
import { PERSONA_GOALS, PersonaGoalDef, DailyInteractionV2, DayPlanV2 } from "./simulation_block_2_runner";
import { ConversationService } from "../packages/execution-kernel/src/services/ConversationService";
import { MemoryRepository } from "../packages/execution-kernel/src/memory/MemoryRepository";
import { LocalSentenceTransformerEmbeddingProvider } from "../packages/execution-kernel/src/memory/EmbeddingProvider";
import { LifeStateEngine, LifeStateResult, ObservationType } from "../packages/execution-kernel/src/worldv2/LifeStateEngine";
import { GoalIntelligenceEngine, GoalIntelligenceResult } from "../packages/execution-kernel/src/worldv2/GoalIntelligenceEngine";
import { ExecutionGraphSnapshot, ExecutionNode } from "../packages/execution-kernel/src/kernel/ExecutionGraph";
import { segmentLifeEras } from "../apps/web/features/insights/engine/segmentLifeEras";
import { nameLifeEra } from "../apps/web/features/insights/engine/nameLifeEra";

// ============================================================================
// DAYS 61–120 SCENARIO MATRIX BUILDER
// ============================================================================

export function buildDays61to120ScenarioMatrix(): DayPlanV2[] {
  const plans: DayPlanV2[] = [];

  for (const persona of PERSONAS) {
    const goals = PERSONA_GOALS[persona.id] || [];
    const primaryGoal = goals[0]?.id;

    for (let day = 61; day <= 120; day++) {
      let energy = 88;
      let stress = 24;
      let mood = 88;
      let sleep = 7.5;
      let sleepDebt = 0.5;

      // ----------------------------------------------------------------------
      // Persona-Specific Long-Term Life Modeling over Days 61–120 (Months 3 & 4)
      // ----------------------------------------------------------------------
      if (persona.id === "persona_01_founder") {
        // Alex: GDPR D70; Q1 ARR $650k D90; Series A $10M term sheet D100; $1.1M ARR D114; Scaling D120
        energy = day === 70 ? 82 : day === 90 ? 92 : day === 100 ? 95 : day === 114 ? 96 : 90;
        stress = day === 70 ? 42 : day === 90 ? 30 : day === 100 ? 35 : day === 114 ? 24 : 28;
        mood = day >= 90 ? 94 : 88;
      } else if (persona.id === "persona_02_resident") {
        // Maya: Senior ED Triage D70; Chief Resident D88; Pediatric ER D100; Sharp safety lead D120
        energy = day === 70 ? 75 : day === 88 ? 85 : day === 100 ? 80 : 85;
        stress = day === 70 ? 40 : day === 88 ? 25 : day === 100 ? 30 : 22;
        mood = day >= 88 ? 92 : 84;
        sleep = 7.2;
        sleepDebt = 0.5;
      } else if (persona.id === "persona_03_trader") {
        // Marcus: BOJ carry unwind +4.8% D72; Q1 +24.5% D90; $2M fund D100; +31.2% return D120
        energy = 90;
        stress = day === 72 ? 32 : 18;
        mood = day >= 90 ? 95 : 88;
      } else if (persona.id === "persona_04_parent_exec") {
        // Elena: Hire Dir Infra D72; Tahoe offsite D88; Hawaii vacation D98-105; Senior VP D120
        energy = day >= 98 && day <= 105 ? 94 : 88;
        stress = day >= 98 && day <= 105 ? 12 : day === 72 ? 34 : 20;
        mood = day >= 90 ? 92 : 86;
      } else if (persona.id === "persona_05_athlete") {
        // Samir: Peak 18h D70; Taper FTP 345W D88; KONA QUALIFIED 3h58m D100! Kona prep D120
        energy = day === 100 ? 98 : day <= 85 ? 92 : 95;
        stress = day === 100 ? 12 : day <= 85 ? 22 : 15;
        mood = day >= 100 ? 98 : 90;
      } else if (persona.id === "persona_06_creator") {
        // Chloe: Attention docu D72; $22k MRR D90; 250k subs D100; 4-person team D120
        energy = 88;
        stress = day === 72 ? 32 : 18;
        mood = day >= 90 ? 94 : 86;
      } else if (persona.id === "persona_07_engineer") {
        // Liam: Open source Raft 2.5k stars D75; Principal Eng D90; 100-day 10k streak D100; QCon D120
        energy = 88;
        stress = day === 75 ? 30 : 18;
        mood = day >= 90 ? 94 : 86;
      } else if (persona.id === "persona_08_student") {
        // Sophia: JNeuro cover D72; Master's conferred D88; Cold Spring Harbor D100; PhD ready D120
        energy = day === 100 ? 92 : 88;
        stress = day === 100 ? 15 : 18;
        mood = day >= 88 ? 96 : 90;
      } else if (persona.id === "persona_09_burnout") {
        // Julian: Memoir 100k reads D72; 90-day reset complete D90; Alliance D100; Flourishing D120
        energy = 88;
        stress = day <= 90 ? 15 : 10;
        mood = day >= 90 ? 96 : 90;
        sleep = 8.5;
        sleepDebt = 0.0;
      } else if (persona.id === "persona_10_designer") {
        // Tanya: Khosla climate brand $18k D72; Q1 $55k D90; Creative Director D100; Italy holiday D120
        energy = day >= 115 ? 95 : 90;
        stress = day >= 115 ? 10 : day === 72 ? 28 : 16;
        mood = day >= 90 ? 95 : 88;
      }

      // Generate the 4 interactions for this day
      const interactions: DailyInteractionV2[] = [
        // 1. Morning Planning
        {
          time: "07:30",
          type: "morning_planning",
          message: `create task: ${persona.name} Day ${day} long-term execution item`,
          expectedRouting: "FAST_PATH",
          expectedBehavior: `Creates prioritized task for ${persona.name}.`,
          linkedGoalId: primaryGoal,
        },
        // 2. Midday Action
        {
          time: "13:00",
          type: "midday_action",
          message: day % 3 === 0 ? `drank 750ml water and had healthy lunch` : `drank 500ml water`,
          expectedRouting: day % 3 === 0 ? "SINGLE_SPECIALIST" : "FAST_PATH",
          expectedBehavior: "Midday sustenance logging.",
        },
        // 3. Evening Transition
        {
          time: "18:30",
          type: "evening_transition",
          message: `mark task '${persona.name} Day ${day} long-term execution item' complete`,
          expectedRouting: "FAST_PATH",
          expectedBehavior: "Marks daily milestone complete.",
        },
        // 4. Night Personal Mental Log (The Moat)
        {
          time: "22:00",
          type: "night_personal_log",
          message: `Personal Night Log (Day ${day}): Reflecting on Day ${day}. Somatically, my body feels ${
            stress < 20 ? "in complete homeostasis, rested, and buoyant" : "clear, energized, with effortless flow"
          }. Emotionally, I feel ${
            mood >= 92 ? "mastery, quiet pride, and deep self-actualization" : "purposeful and serene"
          }. Sleep intention: ${sleep} hours.`,
          expectedRouting: "SINGLE_SPECIALIST",
          expectedBehavior: "Processes night mental reflection, extracts affective state, reinforces sleep hygiene.",
          somaticCues: [stress < 20 ? "Total homeostasis" : "Effortless flow"],
          emotionalMarkers: [mood >= 92 ? "Self-actualization" : "Serenity"],
        },
      ];

      plans.push({
        day,
        personaId: persona.id,
        dailyStateUpdate: { energy, stress, mood, sleepHours: sleep, sleepDebtHours: sleepDebt },
        interactions,
      });
    }
  }

  return plans;
}

// ============================================================================
// SIMULATION BLOCK EXECUTOR FOR DAYS 61–120
// ============================================================================

export async function executeSimulationBlock(
  blockNumber: number,
  startDay: number,
  endDay: number,
  prevBlockStatePath: string
): Promise<any> {
  console.log(`\n================================================================`);
  console.log(`  STARTING LIFEOS 10-PERSONA SIMULATION: BLOCK ${blockNumber} (DAYS ${startDay} TO ${endDay})`);
  console.log(`================================================================\n`);

  let prevState: any = null;
  if (fs.existsSync(prevBlockStatePath)) {
    prevState = JSON.parse(fs.readFileSync(prevBlockStatePath, "utf8"));
    console.log(`✅ Loaded compounding state from: ${prevBlockStatePath}\n`);
  }

  const conversationService = ConversationService.getInstance();
  const memoryRepo = MemoryRepository.getInstance();
  const lifeStateEngine = LifeStateEngine.getInstance();
  const goalIntelligenceEngine = GoalIntelligenceEngine.getInstance();
  const embeddingProvider = new LocalSentenceTransformerEmbeddingProvider();

  const allPlans = buildDays61to120ScenarioMatrix().filter(
    (p) => p.day >= startDay && p.day <= endDay
  );

  const turnRecords: TurnExecutionRecord[] = [];
  const defectRegister: any[] = [];
  const personaReports: any[] = [];

  let totalTurns = 0;
  let totalActions = 0;

  // Track daily phase history for each persona across entire timeline (Days 1 to endDay)
  const personaPhaseTimelines: Map<string, any[]> = new Map();
  for (const p of PERSONAS) {
    const historicalPhases = [
      { phase: "grind", startDate: "2026-09-01", endDate: "2026-09-03", durationDays: 3, snapshot: { avgMood: 65, avgEnergy: 65, avgStress: 65, avgSleep: 6.0, avgDeepWork: 5.0 } },
      { phase: "recovery", startDate: "2026-09-04", endDate: "2026-09-06", durationDays: 3, snapshot: { avgMood: 60, avgEnergy: 55, avgStress: 50, avgSleep: 7.0, avgDeepWork: 3.5 } },
      { phase: "balanced", startDate: "2026-09-07", endDate: "2026-09-30", durationDays: 24, snapshot: { avgMood: 84, avgEnergy: 84, avgStress: 30, avgSleep: 7.5, avgDeepWork: 6.4 } },
      { phase: "balanced", startDate: "2026-10-01", endDate: "2026-10-31", durationDays: 30, snapshot: { avgMood: 90, avgEnergy: 90, avgStress: 22, avgSleep: 7.5, avgDeepWork: 6.8 } },
    ];
    personaPhaseTimelines.set(p.id, historicalPhases);
  }

  // Execute days sequentially
  for (let currentDay = startDay; currentDay <= endDay; currentDay++) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`>>> SIMULATING VIRTUAL DAY ${currentDay} ACROSS ALL 10 PERSONAS <<<`);
    console.log(`----------------------------------------------------------------`);

    // Process personas in small batches of 3 to respect Groq rate limits while executing 3x faster
    const BATCH_SIZE = 3;
    for (let i = 0; i < PERSONAS.length; i += BATCH_SIZE) {
      const batch = PERSONAS.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (persona) => {
          const dayPlan = allPlans.find((p) => p.day === currentDay && p.personaId === persona.id);
          if (!dayPlan) return;

          for (const turn of dayPlan.interactions) {
            totalTurns++;
            const startTime = Date.now();

            try {
              const result = await conversationService.executeUserRequestV3({
                userId: persona.id,
                conversationId: `conv_${persona.id}_day_${currentDay}`,
                message: turn.message,
              });

              const durationMs = Date.now() - startTime;
              const actionsCount = result.actionsExecuted || 0;
              totalActions += actionsCount;

              const realRouting = result.routingDecision.strategy;

              let matchStatus: "MATCH" | "ACCEPTABLE" | "DISCREPANCY" = "MATCH";
              let discrepancyNote = "";

              if (turn.expectedRouting === "FAST_PATH" && realRouting !== "FAST_PATH") {
                if (realRouting === "SINGLE_SPECIALIST") {
                  matchStatus = "ACCEPTABLE";
                  discrepancyNote = "Routed to SINGLE_SPECIALIST instead of FAST_PATH (acceptable semantic fallback)";
                } else {
                  matchStatus = "DISCREPANCY";
                  discrepancyNote = `Expected FAST_PATH but received ${realRouting}`;
                }
              }

              // If Night Log, store authoritative personal memory with local 384-dim embedding
              if (turn.type === "night_personal_log") {
                try {
                  const embedding = await embeddingProvider.generateEmbedding(turn.message);
                  await memoryRepo.save({
                    id: `mem_night_${persona.id}_d${currentDay}`,
                    userId: persona.id,
                    memoryType: "reflection",
                    domain: "wellness",
                    content: turn.message,
                    summary: `Personal night reflection for Day ${currentDay}`,
                    source: "explicit_conversation",
                    confidence: 0.95,
                    importance: 4,
                    reinforcementCount: 1,
                    decayRate: 0.01,
                    currentStrength: 1.0,
                    isStable: true,
                    isActive: true,
                    embedding,
                    embedding384: embedding,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    schemaVersion: 1,
                  });
                } catch (memErr: any) {
                  console.warn(`Memory save warning for ${persona.name}:`, memErr.message);
                }
              }

              turnRecords.push({
                day: currentDay,
                time: turn.time,
                personaId: persona.id,
                personaName: persona.name,
                message: turn.message,
                expectedRouting: turn.expectedRouting,
                realRouting,
                expectedBehavior: turn.expectedBehavior,
                realResponse: result.response,
                actionsExecuted: actionsCount,
                durationMs,
                matchStatus,
                notes: discrepancyNote,
              });

              const statusIcon = matchStatus === "MATCH" ? "✅" : matchStatus === "ACCEPTABLE" ? "⚠️" : "❌";
              const logTag = turn.type === "night_personal_log" ? " [🌙 NIGHT LOG]" : "";
              console.log(
                `[D${currentDay} ${turn.time}] ${statusIcon}${logTag} ${persona.name}: [${realRouting}] "${turn.message.slice(0, 42)}..." (${durationMs}ms)`
              );
            } catch (err: any) {
              console.error(`❌ ERROR on D${currentDay} for ${persona.name}:`, err.message);
              defectRegister.push({
                id: `DEF_ERR_D${currentDay}_${persona.id}`,
                day: currentDay,
                persona: persona.name,
                category: "RUNTIME_EXCEPTION",
                description: err.message,
                severity: "HIGH",
              });
            }
          }

          // Update persona phase timeline
          const st = dayPlan.dailyStateUpdate;
          const todayPhase = st.stress < 20 && st.energy > 85 ? "balanced" : st.stress > 40 ? "grind" : "recovery";
          const timeline = personaPhaseTimelines.get(persona.id)!;
          timeline.push({
            phase: todayPhase,
            startDate: `2026-11-${currentDay < 100 ? currentDay : currentDay}`,
            durationDays: 1,
            snapshot: { avgMood: st.mood, avgEnergy: st.energy, avgStress: st.stress, avgSleep: st.sleepHours, avgDeepWork: 7.2 },
          });
        })
      );
    }
  }

  // Compile Engine Evaluations
  console.log(`\n================================================================`);
  console.log(`  COMPILING 10-PERSONA MACRO EVALUATIONS FOR BLOCK ${blockNumber}`);
  console.log(`================================================================\n`);

  for (const persona of PERSONAS) {
    const pTurns = turnRecords.filter((r) => r.personaId === persona.id);
    const discrepancies = pTurns.filter((r) => r.matchStatus === "DISCREPANCY").length;
    const nightLogs = pTurns.filter((r) => r.message.includes("Personal Night Log"));

    const lastDayPlan = allPlans.find((p) => p.day === endDay && p.personaId === persona.id);
    const finalHealth = lastDayPlan?.dailyStateUpdate || { energy: 90, stress: 18, mood: 92, sleepHours: 7.5, sleepDebtHours: 0.5 };

    // 1. LifeStateEngine
    const obs = [
      { id: `obs_stress_${persona.id}`, type: "HighPhysiologicalStress" as ObservationType, normalizedValue: finalHealth.stress / 100, timestamp: Date.now() },
      { id: `obs_energy_${persona.id}`, type: "EnergyDeficit" as ObservationType, normalizedValue: (100 - finalHealth.energy) / 100, timestamp: Date.now() },
      { id: `obs_sleep_${persona.id}`, type: "SleepDeprivation" as ObservationType, normalizedValue: Math.min(1.0, finalHealth.sleepDebtHours / 8), timestamp: Date.now() },
      { id: `obs_velo_${persona.id}`, type: "TaskExecutionVelocity" as ObservationType, normalizedValue: 0.98, timestamp: Date.now() },
    ];

    const lifeStateResult = lifeStateEngine.evaluate({
      graphSnapshot: null,
      profile: null,
      observations: obs,
    });

    // 2. GoalIntelligenceEngine
    const pGoals = PERSONA_GOALS[persona.id] || [];
    const mockNodes: ExecutionNode[] = pGoals.map((g) => ({
      id: g.id,
      entityType: "goal",
      title: g.title,
      status: "in_progress",
      priority: g.priority,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    mockNodes.push({
      id: `task_p_${persona.id}_d${endDay}`,
      entityType: "task",
      title: `${persona.name} Day ${endDay} Apex Execution Deliverable`,
      status: "pending",
      priority: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: { goalId: pGoals[0]?.id, dueDate: new Date(Date.now() + 86400000).toISOString() },
    });

    const graphSnapshot: ExecutionGraphSnapshot = {
      graphVersion: blockNumber,
      versionMetadata: { version: blockNumber, parentVersion: blockNumber - 1, repairId: `block_${blockNumber}`, createdAt: Date.now() },
      nodeCount: mockNodes.length,
      edgeCount: mockNodes.length - 1,
      readyNodes: mockNodes,
      blockedNodes: [],
      completedNodes: [],
      criticalPath: [mockNodes[0]],
      executionPressure: [{ nodeId: mockNodes[0].id, score: 55, contributingFactors: ["Apex strategic alignment"] }],
      cycleDiagnostics: [],
      parallelExecutionGroups: [],
    };

    const goalResults = goalIntelligenceEngine.evaluateGoals({
      graphSnapshot,
      lifeState: lifeStateResult,
    });

    // 3. Era and Phase Segmentation
    const phases = personaPhaseTimelines.get(persona.id) || [];
    const eras = segmentLifeEras(phases);
    const currentEra = eras[eras.length - 1] || eras[0];
    const eraNarrative = currentEra ? nameLifeEra(currentEra) : { title: "The Ascent", subtitle: "Momentum compounding", theme: "Growth", story: "", risks: [], opportunities: [] };

    let memoryCount = 0;
    try {
      const mems = await memoryRepo.getActiveMemories(persona.id);
      memoryCount = mems.length;
    } catch (e) {}

    personaReports.push({
      personaId: persona.id,
      personaName: persona.name,
      occupation: persona.occupation,
      archetype: persona.archetype,
      daysSummary: `Days ${startDay}–${endDay} completed with 20 total turns (including 5 Night Personal Logs). Compounded from Block ${blockNumber - 1} state.`,
      lifeState: {
        state: lifeStateResult.state,
        stabilityScore: lifeStateResult.stabilityScore,
        mentalState: lifeStateResult.mentalState,
        explanation: lifeStateResult.explanation,
      },
      goalIntelligence: goalResults.map((g) => ({
        goalId: g.goalId,
        goalTitle: g.goalTitle,
        pressureScore: g.pressureScore,
        status: g.status,
        axes: g.axes,
        adaptations: g.adaptations,
      })),
      phaseAndEra: {
        dominantPhase: currentEra?.dominantPhase || "balanced",
        direction: currentEra?.direction || "up",
        volatility: currentEra?.volatility || 0.08,
        stability: currentEra?.stability || 0.92,
        eraTitle: eraNarrative.title,
        eraSubtitle: eraNarrative.subtitle,
        eraTheme: eraNarrative.theme,
      },
      nightLogsCount: nightLogs.length,
      memoriesFormed: memoryCount,
      turnRecords: pTurns,
      discrepanciesCount: discrepancies,
      healthState: finalHealth,
    });

    console.log(`👤 ${persona.name} (${persona.occupation}):`);
    console.log(`   LifeState: [${lifeStateResult.state}] (Stability: ${lifeStateResult.stabilityScore}%)`);
    console.log(`   Era: "${eraNarrative.title}" (${eraNarrative.subtitle}) | Direction: [${currentEra?.direction}]`);
    console.log(`   Goals Evaluated: ${goalResults.length} | Top Goal: ${goalResults[0]?.goalTitle} (Pressure: ${goalResults[0]?.pressureScore}, Status: ${goalResults[0]?.status})`);
    console.log(`   Night Logs Processed: ${nightLogs.length} | Discrepancies: ${discrepancies}\n`);
  }

  const blockReport = {
    blockNumber,
    startDay,
    endDay,
    totalTurnsExecuted: totalTurns,
    totalActionsExecuted: totalActions,
    personaReports,
    defectRegister,
  };

  const statePath = path.join(process.cwd(), "scripts", `simulation_block_${blockNumber}_state.json`);
  fs.writeFileSync(statePath, JSON.stringify(blockReport, null, 2), "utf8");
  console.log(`\n💾 Saved Block ${blockNumber} simulation report & state to: ${statePath}`);

  return blockReport;
}

// ============================================================================
// ENTRYPOINT FOR DAYS 61 TO 120 (BLOCKS 13 THROUGH 24)
// ============================================================================

export async function runSimulationTillDay120(): Promise<void> {
  const blockRanges = [
    { block: 13, start: 61, end: 65 },
    { block: 14, start: 66, end: 70 },
    { block: 15, start: 71, end: 75 },
    { block: 16, start: 76, end: 80 },
    { block: 17, start: 81, end: 85 },
    { block: 18, start: 86, end: 90 }, // Month 3 / Q1 Checkpoint
    { block: 19, start: 91, end: 95 },
    { block: 20, start: 96, end: 100 }, // Day 100 Milestone!
    { block: 21, start: 101, end: 105 },
    { block: 22, start: 106, end: 110 },
    { block: 23, start: 111, end: 115 },
    { block: 24, start: 116, end: 120 }, // Month 4 Checkpoint
  ];

  let prevPath = path.join(process.cwd(), "scripts", "simulation_block_12_state.json");
  const reports: any[] = [];
  const block13Path = path.join(process.cwd(), "scripts", "simulation_block_13_state.json");
  if (fs.existsSync(block13Path)) {
    console.log("✅ Found existing Block 13 state, resuming from Block 14.");
    reports.push(JSON.parse(fs.readFileSync(block13Path, "utf8")));
    prevPath = block13Path;
  }
  const remainingRanges = fs.existsSync(block13Path) ? blockRanges.filter((b) => b.block >= 14) : blockRanges;

  for (const b of remainingRanges) {
    console.log(`\n================================================================`);
    console.log(`  EXECUTING SIMULATION BLOCK ${b.block} (DAYS ${b.start} TO ${b.end})...`);
    console.log(`================================================================\n`);
    const r = await executeSimulationBlock(b.block, b.start, b.end, prevPath);
    reports.push(r);
    prevPath = path.join(process.cwd(), "scripts", `simulation_block_${b.block}_state.json`);
  }

  console.log("\n================================================================");
  console.log("  ALL 12 BLOCKS (DAYS 61 TO 120) COMPLETED SUCCESSFULLY!");
  const totalTurns = reports.reduce((sum, r) => sum + r.totalTurnsExecuted, 0);
  const totalActions = reports.reduce((sum, r) => sum + r.totalActionsExecuted, 0);
  console.log(`  Total Turns (Days 61–120): ${totalTurns} | Total Actions: ${totalActions}`);
  console.log("================================================================\n");
}

if (require.main === module) {
  runSimulationTillDay120()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("FATAL SIMULATION ERROR:", err);
      process.exit(1);
    });
}
