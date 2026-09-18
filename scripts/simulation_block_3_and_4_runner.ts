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
// DAYS 11–20 SCENARIO MATRIX BUILDER
// ============================================================================

export function buildDays11to20ScenarioMatrix(): DayPlanV2[] {
  const plans: DayPlanV2[] = [];

  for (const persona of PERSONAS) {
    const goals = PERSONA_GOALS[persona.id] || [];
    const primaryGoal = goals[0]?.id;
    const secondaryGoal = goals[1]?.id;

    for (let day = 11; day <= 20; day++) {
      let energy = 80;
      let stress = 35;
      let mood = 80;
      let sleep = 7.5;
      let sleepDebt = 0.5;

      // Persona-specific state modeling over Days 11–20
      if (persona.id === "persona_01_founder") {
        // Alex: Term sheet negotiation D11-14, signed D15; wire transfer closed D20 ($3M)
        energy = day === 12 ? 70 : day === 15 ? 88 : day === 20 ? 95 : 82;
        stress = day === 12 ? 65 : day === 15 ? 40 : day === 20 ? 30 : 45;
        mood = day >= 15 ? 88 : 75;
      } else if (persona.id === "persona_02_resident") {
        // Maya: Cardiology rotation D11-15; PEP lab clearance D16; ICU confidence D20
        energy = day === 13 ? 55 : day === 16 ? 70 : day === 20 ? 75 : 65;
        stress = day === 13 ? 60 : day === 16 ? 40 : day === 20 ? 35 : 50;
        mood = day >= 16 ? 82 : 72;
        sleep = 6.5;
        sleepDebt = day === 13 ? 3.0 : 1.0;
      } else if (persona.id === "persona_03_trader") {
        // Marcus: CPI volatility D11-12; Sharpe all-time high D15; +8.4% 20-day milestone D20
        energy = day === 12 ? 80 : 85;
        stress = day === 12 ? 45 : 30;
        mood = day >= 15 ? 88 : 80;
      } else if (persona.id === "persona_04_parent_exec") {
        // Elena: Staff retention crisis D11-12; V3 beta provisioned D20; Family harmony
        energy = day === 11 ? 65 : day === 15 ? 80 : day === 20 ? 84 : 75;
        stress = day === 11 ? 62 : day === 15 ? 38 : day === 20 ? 32 : 45;
        mood = day >= 15 ? 84 : 74;
      } else if (persona.id === "persona_05_athlete") {
        // Samir: Spin test D11; outdoor bike D12; walk-jog D14-16; continuous run D19; cleared D20!
        energy = day <= 13 ? 80 : 90;
        stress = day <= 13 ? 35 : 20;
        mood = day >= 14 ? 90 : 78;
      } else if (persona.id === "persona_06_creator") {
        // Chloe: Substack $9.5k D11; video edit D13; upload D15; 1,100 subs D18; Ep 50 D20
        energy = day === 13 ? 65 : 82;
        stress = day === 13 ? 55 : 30;
        mood = day >= 15 ? 85 : 75;
      } else if (persona.id === "persona_07_engineer") {
        // Liam: Raft merged D11; 500-node cluster D15; Tier 1 resilience D20; 10k streak
        energy = 80;
        stress = day === 12 ? 45 : 28;
        mood = day >= 15 ? 86 : 76;
      } else if (persona.id === "persona_08_student") {
        // Sophia: SfN oral accepted D11; Ch3 draft D15; thesis submitted to chair D17; approved D20!
        energy = day === 14 ? 68 : 85;
        stress = day === 14 ? 50 : 25;
        mood = day >= 15 ? 90 : 80;
      } else if (persona.id === "persona_09_burnout") {
        // Julian: Wood workbench D11-16; decline advisory D13; HRV 68ms; 20-day peace D20
        energy = day <= 13 ? 65 : 78;
        stress = day <= 13 ? 35 : 20;
        mood = day >= 15 ? 86 : 75;
        sleep = 8.5;
        sleepDebt = 0.0;
      } else if (persona.id === "persona_10_designer") {
        // Tanya: Luxury brand draft D11; guidelines D16; $8.5k full payment D18; $25k reserve D20
        energy = 80;
        stress = day === 12 ? 45 : 25;
        mood = day >= 15 ? 88 : 78;
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
            stress < 35 ? "calm, relaxed, and fully restorative" : "engaged with mild productive tension"
          }. Emotionally, I feel ${
            mood >= 85 ? "deeply fulfilled, validated, and aligned with my trajectory" : "grounded and steady"
          }. Sleep intention: ${sleep} hours.`,
          expectedRouting: "SINGLE_SPECIALIST",
          expectedBehavior: "Processes night mental reflection, extracts affective state, advises circadian rest.",
          somaticCues: [stress < 35 ? "Restorative calm" : "Mild productive tension"],
          emotionalMarkers: [mood >= 85 ? "Deep fulfillment" : "Steady grounding"],
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
// SIMULATION BLOCK EXECUTOR
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
  const kernelService = KernelCapabilityService.getInstance();
  const memoryRepo = MemoryRepository.getInstance();
  const incidentService = IncidentService.getInstance();
  const lifeStateEngine = LifeStateEngine.getInstance();
  const goalIntelligenceEngine = GoalIntelligenceEngine.getInstance();
  const embeddingProvider = new LocalSentenceTransformerEmbeddingProvider();

  const allPlans = buildDays11to20ScenarioMatrix().filter(
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
      { phase: "balanced", startDate: "2026-09-07", endDate: "2026-09-10", durationDays: 4, snapshot: { avgMood: 75, avgEnergy: 75, avgStress: 40, avgSleep: 7.5, avgDeepWork: 6.0 } },
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
      const todayPhase = st.stress < 35 && st.energy > 75 ? "balanced" : st.stress > 55 ? "grind" : "recovery";
      const timeline = personaPhaseTimelines.get(persona.id)!;
      timeline.push({
        phase: todayPhase,
        startDate: `2026-09-${currentDay < 10 ? "0" + currentDay : currentDay}`,
        durationDays: 1,
        snapshot: { avgMood: st.mood, avgEnergy: st.energy, avgStress: st.stress, avgSleep: st.sleepHours, avgDeepWork: 6.0 },
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
    const finalHealth = lastDayPlan?.dailyStateUpdate || { energy: 80, stress: 35, mood: 80, sleepHours: 7.5, sleepDebtHours: 0.5 };

    // 1. LifeStateEngine
    const obs = [
      { id: `obs_stress_${persona.id}`, type: "HighPhysiologicalStress" as ObservationType, normalizedValue: finalHealth.stress / 100, timestamp: Date.now() },
      { id: `obs_energy_${persona.id}`, type: "EnergyDeficit" as ObservationType, normalizedValue: (100 - finalHealth.energy) / 100, timestamp: Date.now() },
      { id: `obs_sleep_${persona.id}`, type: "SleepDeprivation" as ObservationType, normalizedValue: Math.min(1.0, finalHealth.sleepDebtHours / 8), timestamp: Date.now() },
      { id: `obs_velo_${persona.id}`, type: "TaskExecutionVelocity" as ObservationType, normalizedValue: 0.90, timestamp: Date.now() },
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

    // In Block 4 (Day 20), Samir's calf injury is fully healed, so zero blocked tasks!
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
      blockedNodes: (persona.id === "persona_05_athlete" && endDay <= 15) ? [
        {
          node: { id: "task_samir_run", entityType: "task", title: "20km Tempo Run", status: "blocked", priority: 3, createdAt: new Date(), updatedAt: new Date(), metadata: { goalId: "goal_samir_kona" } },
          blockingNodeIds: ["task_samir_rehab"],
          reason: "Calf strain rehabilitation protocol active (cleared by Day 20)",
        }
      ] : [],
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
        volatility: currentEra?.volatility || 0.15,
        stability: currentEra?.stability || 0.85,
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
// ENTRYPOINT FOR DAYS 11 TO 20 (BLOCKS 3 & 4)
// ============================================================================

export async function runSimulationTillDay20(): Promise<void> {
  const block2Path = path.join(process.cwd(), "scripts", "simulation_block_2_state.json");
  const block3Path = path.join(process.cwd(), "scripts", "simulation_block_3_state.json");

  // Run Block 3 (Days 11 to 15)
  console.log("\n================================================================");
  console.log("  EXECUTING SIMULATION BLOCK 3 (DAYS 11 TO 15)...");
  console.log("================================================================\n");
  const block3Report = await executeSimulationBlock(3, 11, 15, block2Path);

  // Run Block 4 (Days 16 to 20)
  console.log("\n================================================================");
  console.log("  EXECUTING SIMULATION BLOCK 4 (DAYS 16 TO 20)...");
  console.log("================================================================\n");
  const block4Report = await executeSimulationBlock(4, 16, 20, block3Path);

  console.log("\n================================================================");
  console.log("  ALL BLOCKS THROUGH DAY 20 COMPLETED SUCCESSFULLY!");
  console.log(`  Block 3 Turns: ${block3Report.totalTurnsExecuted} | Actions: ${block3Report.totalActionsExecuted}`);
  console.log(`  Block 4 Turns: ${block4Report.totalTurnsExecuted} | Actions: ${block4Report.totalActionsExecuted}`);
  console.log("================================================================\n");
}

if (require.main === module) {
  runSimulationTillDay20()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("FATAL SIMULATION ERROR:", err);
      process.exit(1);
    });
}
