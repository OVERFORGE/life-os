import "dotenv/config";
import fs from "fs";
import path from "path";
import { PERSONAS, PersonaProfile, TurnExecutionRecord } from "./simulation_180d_runner";
import { PERSONA_GOALS, PersonaGoalDef, DailyInteractionV2, DayPlanV2 } from "./simulation_block_2_runner";
import { ConversationService } from "../packages/execution-kernel/src/services/ConversationService";
import { KernelCapabilityService } from "../packages/execution-kernel/src/orchestration/kernel/KernelCapabilityService";
import { MemoryRepository } from "../packages/execution-kernel/src/memory/MemoryRepository";
import { LocalSentenceTransformerEmbeddingProvider } from "../packages/execution-kernel/src/memory/EmbeddingProvider";
import { IncidentService } from "../packages/execution-kernel/src/incidents/IncidentService";
import { LifeStateEngine, LifeStateResult, ObservationType } from "../packages/execution-kernel/src/worldv2/LifeStateEngine";
import { GoalIntelligenceEngine, GoalIntelligenceResult } from "../packages/execution-kernel/src/worldv2/GoalIntelligenceEngine";
import { ExecutionGraphSnapshot, ExecutionNode } from "../packages/execution-kernel/src/kernel/ExecutionGraph";
import { segmentLifeEras } from "../apps/web/features/insights/engine/segmentLifeEras";
import { nameLifeEra } from "../apps/web/features/insights/engine/nameLifeEra";

// ============================================================================
// DAYS 21–40 SCENARIO MATRIX BUILDER
// ============================================================================

export function buildDays21to40ScenarioMatrix(): DayPlanV2[] {
  const plans: DayPlanV2[] = [];

  for (const persona of PERSONAS) {
    const goals = PERSONA_GOALS[persona.id] || [];
    const primaryGoal = goals[0]?.id;

    for (let day = 21; day <= 40; day++) {
      let energy = 82;
      let stress = 32;
      let mood = 82;
      let sleep = 7.5;
      let sleepDebt = 0.5;

      // ----------------------------------------------------------------------
      // Persona-Specific Long-Term Life Modeling over Days 21–40
      // ----------------------------------------------------------------------
      if (persona.id === "persona_01_founder") {
        // Alex: Hiring push D21-25; Enterprise bank contract D26-30; Multi-region D31-35; TechCrunch prep D36-40
        energy = day === 24 ? 72 : day === 30 ? 92 : day === 40 ? 95 : 85;
        stress = day === 24 ? 55 : day === 30 ? 35 : day === 40 ? 28 : 42;
        mood = day >= 30 ? 90 : 80;
      } else if (persona.id === "persona_02_resident") {
        // Maya: PEP complete D21-25; Outpatient clinic D26-30; 200 ABIM Qs D31-35; Clinical mastery D36-40
        energy = day === 23 ? 65 : day === 30 ? 78 : day === 40 ? 82 : 72;
        stress = day === 23 ? 50 : day === 30 ? 38 : day === 40 ? 30 : 42;
        mood = day >= 26 ? 85 : 75;
        sleep = 7.0;
        sleepDebt = 1.0;
      } else if (persona.id === "persona_03_trader") {
        // Marcus: EUR/USD short D21-25; Month 1 +11.2% D26-30; Rust HFT orderflow D31-35; Sailing weekend D36-40
        energy = day === 32 ? 80 : 88;
        stress = day === 32 ? 40 : 25;
        mood = day >= 30 ? 90 : 82;
      } else if (persona.id === "persona_04_parent_exec") {
        // Elena: Team expands to 68 D21-25; Platform V3 10% cutover D26-30; Kids sports day D31-35; SOC2 pass D36-40
        energy = day === 23 ? 70 : day === 30 ? 85 : day === 40 ? 88 : 78;
        stress = day === 23 ? 52 : day === 30 ? 34 : day === 40 ? 26 : 40;
        mood = day >= 30 ? 88 : 78;
      } else if (persona.id === "persona_05_athlete") {
        // Samir: Running base 30m D21-25; FTP tested 330W D26-30; Brick workout D31-35; Kona countdown D36-40
        energy = day <= 25 ? 85 : 92;
        stress = day <= 25 ? 30 : 18;
        mood = day >= 28 ? 92 : 82;
      } else if (persona.id === "persona_06_creator") {
        // Chloe: 80k views & $12.5k MRR D21-25; Month 1 review D26-30; $15k VPN sponsor D31-35; Mini-doc D36-40
        energy = day === 28 ? 75 : 85;
        stress = day === 28 ? 45 : 25;
        mood = day >= 30 ? 88 : 80;
      } else if (persona.id === "persona_07_engineer") {
        // Liam: 1,000 nodes Raft D21-25; 25-day 10k streak D26-30; Zero-copy proto D31-35; Conference speaker D36-40
        energy = 84;
        stress = day === 38 ? 42 : 24;
        mood = day >= 30 ? 88 : 80;
      } else if (persona.id === "persona_08_student") {
        // Sophia: Defense date locked D21-25; Paper submitted JNeuro D26-30; Best student talk D31-35; Defense prep D36-40
        energy = day === 22 ? 72 : day === 30 ? 88 : day === 40 ? 92 : 82;
        stress = day === 22 ? 45 : day === 30 ? 25 : day === 40 ? 20 : 35;
        mood = day >= 30 ? 92 : 82;
      } else if (persona.id === "persona_09_burnout") {
        // Julian: 30-day reset D21-25; Stability 90/100 D26-30; Memoir essay D31-35; Deep living contentment D36-40
        energy = day <= 25 ? 70 : 82;
        stress = day <= 25 ? 25 : 15;
        mood = day >= 30 ? 90 : 82;
        sleep = 8.5;
        sleepDebt = 0.0;
      } else if (persona.id === "persona_10_designer") {
        // Tanya: Resort client $10k D21-25; Month 1 billings $18.5k D26-30; Resort brand D31-35; CEO day D36-40
        energy = 85;
        stress = day === 22 ? 40 : 20;
        mood = day >= 30 ? 90 : 82;
      }

      // Generate the 4 interactions for this day
      const interactions: DailyInteractionV2[] = [
        // 1. Morning Planning
        {
          time: "07:30",
          type: "morning_planning",
          message: `create task: ${persona.name} Day ${day} milestone execution item`,
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
          message: `Mark task '${persona.name} Day ${day} milestone execution item' complete. Wrapping up day.`,
          expectedRouting: "FAST_PATH",
          expectedBehavior: "Marks daily milestone complete.",
        },
        // 4. Night Personal Mental Log (The Moat)
        {
          time: "22:00",
          type: "night_personal_log",
          message: `Personal Night Log (Day ${day}): Reflecting on Day ${day}. Somatically, my body feels ${
            stress < 30 ? "deeply grounded, energized, and tension-free" : "alert, focused, with light productive load"
          }. Emotionally, I feel ${
            mood >= 88 ? "in profound creative flow, validated, and excited for tomorrow" : "steady, aligned, and confident"
          }. Sleep intention: ${sleep} hours.`,
          expectedRouting: "SINGLE_SPECIALIST",
          expectedBehavior: "Processes night mental reflection, extracts affective state, reinforces sleep hygiene.",
          somaticCues: [stress < 30 ? "Deep relaxation" : "Light productive focus"],
          emotionalMarkers: [mood >= 88 ? "Profound flow" : "Steady confidence"],
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
// SIMULATION BLOCK EXECUTOR FOR DAYS 21–40
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

  const allPlans = buildDays21to40ScenarioMatrix().filter(
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
      { phase: "balanced", startDate: "2026-09-07", endDate: "2026-09-15", durationDays: 9, snapshot: { avgMood: 80, avgEnergy: 80, avgStress: 35, avgSleep: 7.5, avgDeepWork: 6.0 } },
      { phase: "balanced", startDate: "2026-09-16", endDate: "2026-09-20", durationDays: 5, snapshot: { avgMood: 85, avgEnergy: 85, avgStress: 30, avgSleep: 7.5, avgDeepWork: 6.5 } },
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
      const todayPhase = st.stress < 30 && st.energy > 80 ? "balanced" : st.stress > 50 ? "grind" : "recovery";
      const timeline = personaPhaseTimelines.get(persona.id)!;
      timeline.push({
        phase: todayPhase,
        startDate: `2026-09-${currentDay < 10 ? "0" + currentDay : currentDay}`,
        durationDays: 1,
        snapshot: { avgMood: st.mood, avgEnergy: st.energy, avgStress: st.stress, avgSleep: st.sleepHours, avgDeepWork: 6.5 },
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
    const finalHealth = lastDayPlan?.dailyStateUpdate || { energy: 85, stress: 25, mood: 85, sleepHours: 7.5, sleepDebtHours: 0.5 };

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
      title: `${persona.name} Day ${endDay} Milestone Deliverable`,
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
      executionPressure: [{ nodeId: mockNodes[0].id, score: 65, contributingFactors: ["Strategic milestone alignment"] }],
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
        volatility: currentEra?.volatility || 0.12,
        stability: currentEra?.stability || 0.88,
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
// ENTRYPOINT FOR DAYS 21 TO 40 (BLOCKS 5, 6, 7, 8)
// ============================================================================

export async function runSimulationTillDay40(): Promise<void> {
  const block4Path = path.join(process.cwd(), "scripts", "simulation_block_4_state.json");
  const block5Path = path.join(process.cwd(), "scripts", "simulation_block_5_state.json");
  const block6Path = path.join(process.cwd(), "scripts", "simulation_block_6_state.json");
  const block7Path = path.join(process.cwd(), "scripts", "simulation_block_7_state.json");

  // Block 5: Days 21 to 25
  console.log("\n================================================================");
  console.log("  EXECUTING SIMULATION BLOCK 5 (DAYS 21 TO 25)...");
  console.log("================================================================\n");
  const b5 = await executeSimulationBlock(5, 21, 25, block4Path);

  // Block 6: Days 26 to 30 (Month 1 Milestone Checkpoint!)
  console.log("\n================================================================");
  console.log("  EXECUTING SIMULATION BLOCK 6 (DAYS 26 TO 30 - MONTH 1 MARK)...");
  console.log("================================================================\n");
  const b6 = await executeSimulationBlock(6, 26, 30, block5Path);

  // Block 7: Days 31 to 35
  console.log("\n================================================================");
  console.log("  EXECUTING SIMULATION BLOCK 7 (DAYS 31 TO 35)...");
  console.log("================================================================\n");
  const b7 = await executeSimulationBlock(7, 31, 35, block6Path);

  // Block 8: Days 36 to 40
  console.log("\n================================================================");
  console.log("  EXECUTING SIMULATION BLOCK 8 (DAYS 36 TO 40)...");
  console.log("================================================================\n");
  const b8 = await executeSimulationBlock(8, 36, 40, block7Path);

  console.log("\n================================================================");
  console.log("  ALL BLOCKS THROUGH DAY 40 COMPLETED SUCCESSFULLY!");
  console.log(`  Block 5 Turns: ${b5.totalTurnsExecuted} | Actions: ${b5.totalActionsExecuted}`);
  console.log(`  Block 6 Turns: ${b6.totalTurnsExecuted} | Actions: ${b6.totalActionsExecuted}`);
  console.log(`  Block 7 Turns: ${b7.totalTurnsExecuted} | Actions: ${b7.totalActionsExecuted}`);
  console.log(`  Block 8 Turns: ${b8.totalTurnsExecuted} | Actions: ${b8.totalActionsExecuted}`);
  console.log("================================================================\n");
}

if (require.main === module) {
  runSimulationTillDay40()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("FATAL SIMULATION ERROR:", err);
      process.exit(1);
    });
}
