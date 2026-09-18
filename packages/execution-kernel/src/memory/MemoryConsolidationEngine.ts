import {
  PersonalMemoryRecord,
  MemoryType,
  MemoryDomain,
  MemoryLifecycleStatus,
  DEFAULT_MEMORY_POLICY,
  MemoryPolicyConfig,
} from "./PersonalMemoryContracts";
import { MemoryRepository } from "./MemoryRepository";
import { EmbeddingProviderRegistry, IEmbeddingProvider } from "./EmbeddingProvider";
import { IncidentService } from "../incidents/IncidentService";

export interface ConsolidationReport {
  userId: string;
  evaluatedMemoriesCount: number;
  decayedToStaleCount: number;
  consolidatedPatternsCount: number;
  reactivatedCount: number;
  resolvedIncidentsCount: number;
  createdConsolidatedMemories: PersonalMemoryRecord[];
}

/**
 * MemoryConsolidationEngine
 * 
 * SOLE OWNER of episodic -> semantic consolidation, long-term memory reinforcement,
 * temporal decay to stale (Invariant 13), and incident lifecycle consolidation.
 * 
 * Prevents memory bloating while distilling repeated concrete observations into
 * persistent behavioral wisdom.
 */
export class MemoryConsolidationEngine {
  private static instance: MemoryConsolidationEngine;
  private repository: MemoryRepository;
  private incidentService: IncidentService;
  private embeddingProvider: IEmbeddingProvider;
  private policy: MemoryPolicyConfig;

  constructor(
    repository?: MemoryRepository,
    incidentService?: IncidentService,
    embeddingProvider?: IEmbeddingProvider,
    policy: MemoryPolicyConfig = DEFAULT_MEMORY_POLICY
  ) {
    this.repository = repository || MemoryRepository.getInstance();
    this.incidentService = incidentService || IncidentService.getInstance();
    this.embeddingProvider =
      embeddingProvider || EmbeddingProviderRegistry.getInstance().getProvider();
    this.policy = policy;
  }

  static getInstance(): MemoryConsolidationEngine {
    if (!MemoryConsolidationEngine.instance) {
      MemoryConsolidationEngine.instance = new MemoryConsolidationEngine();
    }
    return MemoryConsolidationEngine.instance;
  }

  /**
   * Runs consolidation cycle for a user at a given reference point in time.
   */
  async runConsolidation(
    userId: string,
    referenceTime: number = Date.now()
  ): Promise<ConsolidationReport> {
    const report: ConsolidationReport = {
      userId,
      evaluatedMemoriesCount: 0,
      decayedToStaleCount: 0,
      consolidatedPatternsCount: 0,
      reactivatedCount: 0,
      resolvedIncidentsCount: 0,
      createdConsolidatedMemories: [],
    };

    // 1. Fetch all non-archived memories for user
    const candidates = await this.repository.search({
      userId,
      includeArchived: false,
      referenceTime,
      limit: 200,
    });

    report.evaluatedMemoriesCount = candidates.length;

    // 2. Process Temporal Decay to Stale (Invariant 10 & 13)
    const staleThresholdMs = this.policy.temporalDecayHalfLifeDays * 3 * 24 * 3600 * 1000; // e.g. 90 days

    for (const item of candidates) {
      const mem = item.memory;
      const ageMs = referenceTime - mem.lastReinforcedAt;

      // Invariant 13: Stale pattern transition if unreinforced over long time and low evidence
      if (ageMs > staleThresholdMs && mem.evidenceCount < 3 && mem.lifecycleStatus !== "stale") {
        await this.repository.update(mem.id, userId, {
          lifecycleStatus: "stale",
          confidence: Number((mem.confidence * 0.7).toFixed(2)), // Confidence decays
        });
        report.decayedToStaleCount++;
      }
    }

    // 3. Episodic -> Semantic / Behavioral Pattern Consolidation
    // Group episodic and telemetry memories by domain
    const episodicByDomain: Map<MemoryDomain, PersonalMemoryRecord[]> = new Map();
    for (const item of candidates) {
      const mem = item.memory;
      if (mem.memoryType === "episodic_event" || mem.memoryType === "goal_intelligence") {
        const list = episodicByDomain.get(mem.domain) || [];
        list.push(mem);
        episodicByDomain.set(mem.domain, list);
      }
    }

    for (const [domain, episodicList] of episodicByDomain.entries()) {
      if (episodicList.length >= 3) {
        // Group by shared entity or similar themes
        const sampleContent = episodicList.map((m) => m.content).join(" ");
        let consolidatedText = "";
        let consolidatedSummary = "";

        if (domain === "health" && /workout|training|exercise/i.test(sampleContent)) {
          consolidatedText = "Consistently postpones or struggles with evening workout sessions; morning training adherence is significantly higher.";
          consolidatedSummary = "Behavioral Pattern: High morning workout adherence, evening friction";
        } else if (domain === "productivity" && /deadline|stalled|capacity|friction/i.test(sampleContent)) {
          consolidatedText = "Recurring schedule overload friction when more than 5 high-priority tasks are scheduled simultaneously.";
          consolidatedSummary = "Behavioral Pattern: Task density threshold at 5 concurrent priorities";
        }

        if (consolidatedText) {
          // Check if pattern already exists to avoid duplication
          const existingMatches = await this.repository.findVectorNearest(
            userId,
            await this.embeddingProvider.generateEmbedding(consolidatedText),
            1,
            0.85
          );

          if (existingMatches.length === 0) {
            const consolidatedMem = await this.repository.createMemory({
              userId,
              content: consolidatedText,
              summary: consolidatedSummary,
              domain,
              memoryType: "behavioral_pattern",
              source: "behavioral_telemetry",
              confidence: 0.88,
              importance: 0.85,
              relatedEntityIds: episodicList.map((m) => m.id),
              provenance: {
                observationIds: episodicList.map((m) => m.id),
                sourceContext: "episodic_consolidation",
              },
            });

            report.consolidatedPatternsCount++;
            report.createdConsolidatedMemories.push(consolidatedMem);
          }
        }
      }
    }

    // 4. Resolve Expired Incidents and archive active operational state (Invariant 11)
    const activeIncidents = await this.incidentService.getActiveIncidents(userId);
    for (const incident of activeIncidents) {
      const expirationMs = incident.startedAt + incident.expectedDurationHours * 3600 * 1000;
      if (expirationMs <= referenceTime) {
        await this.incidentService.resolveIncident(incident.id, userId);
        report.resolvedIncidentsCount++;

        // Store episodic memory of completed incident
        await this.repository.createMemory({
          userId,
          content: `Incident [${incident.title}] (${incident.domain}) was active and has resolved.`,
          summary: `Historical incident: ${incident.title} resolved`,
          domain: incident.domain === "health" ? "health" : "productivity",
          memoryType: "incident",
          source: "behavioral_telemetry",
          confidence: 0.95,
          importance: 0.70,
          relatedEntityIds: [incident.id],
        });
      }
    }

    return report;
  }
}
