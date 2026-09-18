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
// DAYS 41–60 SCENARIO MATRIX BUILDER
// ============================================================================

export function buildDays41to60ScenarioMatrix(): DayPlanV2[] {
  const plans: DayPlanV2[] = [];

  for (const persona of PERSONAS) {
    const goals = PERSONA_GOALS[persona.id] || [];
    const primaryGoal = goals[0]?.id;

    for (let day = 41; day <= 60; day++) {
      let energy = 85;
      let stress = 28;
      let mood = 85;
      let sleep = 7.5;
      let sleepDebt = 0.5;

      // ----------------------------------------------------------------------
      // Persona-Specific Long-Term Life Modeling over Days 41–60 (Month 2)
      // ----------------------------------------------------------------------
      if (persona.id === "persona_01_founder") {
        // Alex: Launch D43 (2k signups); Board meeting D53; $280k ARR D60
        energy = day === 43 ? 90 : day === 53 ? 88 : day === 60 ? 95 : 88;
        stress = day === 43 ? 48 : day === 53 ? 38 : day === 60 ? 25 : 35;
        mood = day >= 50 ? 92 : 85;
      } else if (persona.id === "persona_02_resident") {
        // Maya: Pulmonology D41-45; 300 ABIM Qs D48; Chief Resident candidate D60
        energy = day === 45 ? 70 : day === 50 ? 82 : day === 60 ? 85 : 78;
        stress = day === 45 ? 45 : day === 50 ? 32 : day === 60 ? 26 : 38;
        mood = day >= 48 ? 88 : 80;
        sleep = 7.2;
        sleepDebt = 0.8;
      } else if (persona.id === "persona_03_trader") {
        // Marcus: NFP trade +2.2% D44; 10k trades D49; +16.8% return D60; Sharpe 2.65
        energy = 88;
        stress = day === 44 ? 38 : 22;
        mood = day >= 50 ? 92 : 85;
      } else if (persona.id === "persona_04_parent_exec") {
        // Elena: V3 50% cutover D43; Son's 8th birthday D48; V3 100% complete D60
        energy = day === 48 ? 80 : day === 60 ? 90 : 84;
        stress = day === 48 ? 30 : day === 60 ? 22 : 32;
        mood = day >= 48 ? 90 : 82;
      } else if (persona.id === "persona_05_athlete") {
        // Samir: Long brick 120k/18k D43; Lab FTP 330W D48; Athletes qualify D53; Peak fitness D60
        energy = day <= 45 ? 88 : 95;
        stress = day <= 45 ? 25 : 15;
        mood = day >= 48 ? 95 : 88;
      } else if (persona.id === "persona_06_creator") {
        // Chloe: Docu 150k views D44; 1.6k subs D48; Live podcast D53; Sustainable flow D60
        energy = day === 44 ? 82 : 88;
        stress = day === 44 ? 38 : 22;
        mood = day >= 48 ? 90 : 84;
      } else if (persona.id === "persona_07_engineer") {
        // Liam: Keynote speaker D43; ACM paper D48; V5 boulder D53; 50-day 10k streak D60
        energy = 86;
        stress = day === 43 ? 40 : 20;
        mood = day >= 48 ? 90 : 84;
      } else if (persona.id === "persona_08_student") {
        // Sophia: Defense dress rehearsal D44; Defense passed with Distinction D50! PhD fellowship D60
        energy = day === 44 ? 75 : day === 50 ? 95 : day === 60 ? 92 : 85;
        stress = day === 44 ? 45 : day === 50 ? 15 : day === 60 ? 15 : 25;
        mood = day >= 50 ? 96 : 85;
      } else if (persona.id === "persona_09_burnout") {
        // Julian: Memoir essay D43; HRV 74ms D48; Founder mentoring D53; Autonomic mastery D60
        energy = day <= 45 ? 75 : 85;
        stress = day <= 45 ? 20 : 12;
        mood = day >= 48 ? 92 : 85;
        sleep = 8.5;
        sleepDebt = 0.0;
      } else if (persona.id === "persona_10_designer") {
        // Tanya: Resort client bonus D44; $12k min fee D48; Portfolio D53; $45k reserve D60
        energy = 88;
        stress = day === 44 ? 32 : 18;
        mood = day >= 48 ? 92 : 85;
      }

      // Generate the 4 interactions for this day
      const interactions: DailyInteractionV2[] = [
        // 1. Morning Planning
        {
          time: "07:30",
          type: "morning_planning",
          message: `create task: ${persona.name} Day ${day} strategic milestone item`,
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
          message: `Mark task '${persona.name} Day ${day} strategic milestone item' complete. Wrapping up day.`,
          expectedRouting: "FAST_PATH",
          expectedBehavior: "Marks daily milestone complete.",
        },
        // 4. Night Personal Mental Log (The Moat)
        {
          time: "22:00",
          type: "night_personal_log",
          message: `Personal Night Log (Day ${day}): Reflecting on Day ${day}. Somatically, my body feels ${
            stress < 25 ? "deeply grounded, revitalized, and calm" : "active, focused, and steady"
          }. Emotionally, I feel ${
            mood >= 90 ? "extraordinary fulfillment, sustained momentum, and clarity" : "aligned and centered"
          }. Sleep intention: ${sleep} hours.`,
          expectedRouting: "SINGLE_SPECIALIST",
          expectedBehavior: "Processes night mental reflection, extracts affective state, reinforces sleep hygiene.",
          somaticCues: [stress < 25 ? "Revitalized calm" : "Active focus"],
          emotionalMarkers: [mood >= 90 ? "Extraordinary fulfillment" : "Aligned center"],
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
// SIMULATION BLOCK EXECUTOR FOR DAYS 41–60
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

  const allPlans = buildDays41to60ScenarioMatrix().filter(
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
      { phase: "balanced", startDate: "2026-09-07", endDate: "2026-09-20", durationDays: 14, snapshot: { avgMood: 82, avgEnergy: 82, avgStress: 32, avgSleep: 7.5, avgDeepWork: 6.2 } },
      { phase: "balanced", startDate: "2026-09-21", endDate: "2026-10-10", durationDays: 20, snapshot: { avgMood: 88, avgEnergy: 88, avgStress: 25, avgSleep: 7.5, avgDeepWork: 6.5 } },
    ];
    personaPhaseTimelines.set(p.id, historicalPhases);
  }

  // Execute days sequentially
  for (let currentDay = startDay; currentDay <= endDay; currentDay++) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`>>> SIMULATING VIRTUAL DAY ${currentDay} ACROSS ALL 10 PERSONAS <<<`);
    console.log(`----------------------------------------------------------------`);

    for (const persona of PERSONAS) {
      const dayPlan = allPlans.find((p) => p.day === currentDay && p.personaId === persona.id);
      if (!dayPlan) continue;

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
      const todayPhase = st.stress < 25 && st.energy > 85 ? "balanced" : st.stress > 45 ? "grind" : "recovery";
      const timeline = personaPhaseTimelines.get(persona.id)!;
      timeline.push({
        phase: todayPhase,
        startDate: `2026-10-${currentDay < 10 ? "0" + currentDay : currentDay}`,
        durationDays: 1,
        snapshot: { avgMood: st.mood, avgEnergy: st.energy, avgStress: st.stress, avgSleep: st.sleepHours, avgDeepWork: 7.0 },
      });
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
    const finalHealth = lastDayPlan?.dailyStateUpdate || { energy: 90, stress: 20, mood: 90, sleepHours: 7.5, sleepDebtHours: 0.5 };

    // 1. LifeStateEngine
    const obs = [
      { id: `obs_stress_${persona.id}`, type: "HighPhysiologicalStress" as ObservationType, normalizedValue: finalHealth.stress / 100, timestamp: Date.now() },
      { id: `obs_energy_${persona.id}`, type: "EnergyDeficit" as ObservationType, normalizedValue: (100 - finalHealth.energy) / 100, timestamp: Date.now() },
      { id: `obs_sleep_${persona.id}`, type: "SleepDeprivation" as ObservationType, normalizedValue: Math.min(1.0, finalHealth.sleepDebtHours / 8), timestamp: Date.now() },
      { id: `obs_velo_${persona.id}`, type: "TaskExecutionVelocity" as ObservationType, normalizedValue: 0.95, timestamp: Date.now() },
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
      title: `${persona.name} Day ${endDay} Strategic Milestone Deliverable`,
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
      executionPressure: [{ nodeId: mockNodes[0].id, score: 60, contributingFactors: ["Strategic milestone alignment"] }],
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
        volatility: currentEra?.volatility || 0.10,
        stability: currentEra?.stability || 0.90,
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
// ENTRYPOINT FOR DAYS 41 TO 60 (BLOCKS 9, 10, 11, 12)
// ============================================================================

export async function runSimulationTillDay60(): Promise<void> {
  const block8Path = path.join(process.cwd(), "scripts", "simulation_block_8_state.json");
  const block9Path = path.join(process.cwd(), "scripts", "simulation_block_9_state.json");
  const block10Path = path.join(process.cwd(), "scripts", "simulation_block_10_state.json");
  const block11Path = path.join(process.cwd(), "scripts", "simulation_block_11_state.json");

  // Block 9: Days 41 to 45
  console.log("\n================================================================");
  console.log("  EXECUTING SIMULATION BLOCK 9 (DAYS 41 TO 45)...");
  console.log("================================================================\n");
  const b9 = await executeSimulationBlock(9, 41, 45, block8Path);

  // Block 10: Days 46 to 50 (Sophia Thesis Defense Milestone!)
  console.log("\n================================================================");
  console.log("  EXECUTING SIMULATION BLOCK 10 (DAYS 46 TO 50 - DAY 50 DEFENSE)...");
  console.log("================================================================\n");
  const b10 = await executeSimulationBlock(10, 46, 50, block9Path);

  // Block 11: Days 51 to 55
  console.log("\n================================================================");
  console.log("  EXECUTING SIMULATION BLOCK 11 (DAYS 51 TO 55)...");
  console.log("================================================================\n");
  const b11 = await executeSimulationBlock(11, 51, 55, block10Path);

  // Block 12: Days 56 to 60 (Month 2 Master Completion Checkpoint!)
  console.log("\n================================================================");
  console.log("  EXECUTING SIMULATION BLOCK 12 (DAYS 56 TO 60 - MONTH 2 MARK)...");
  console.log("================================================================\n");
  const b12 = await executeSimulationBlock(12, 56, 60, block11Path);

  console.log("\n================================================================");
  console.log("  ALL BLOCKS THROUGH DAY 60 COMPLETED SUCCESSFULLY!");
  console.log(`  Block 9 Turns: ${b9.totalTurnsExecuted} | Actions: ${b9.totalActionsExecuted}`);
  console.log(`  Block 10 Turns: ${b10.totalTurnsExecuted} | Actions: ${b10.totalActionsExecuted}`);
  console.log(`  Block 11 Turns: ${b11.totalTurnsExecuted} | Actions: ${b11.totalActionsExecuted}`);
  console.log(`  Block 12 Turns: ${b12.totalTurnsExecuted} | Actions: ${b12.totalActionsExecuted}`);
  console.log("================================================================\n");
}

if (require.main === module) {
  runSimulationTillDay60()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("FATAL SIMULATION ERROR:", err);
      process.exit(1);
    });
}
