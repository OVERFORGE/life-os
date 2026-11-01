/**
 * CadenceProfileRepository.ts
 * 
 * Milestone B — Phase B3: Work Package 3 / Loop 5
 * User-Scoped Cadence Profile Persistence & Day-Segmented Cadence Repository
 */

import { DayCadenceProfile, CadenceRoutineBlock } from "../contracts/TemporalContracts";

export interface CadenceProfileRepositoryDependencies {
  cadenceProfileModel?: any;
}

export class CadenceProfileRepository {
  private static instance: CadenceProfileRepository;
  private cadenceProfileModel: any;

  constructor(deps?: CadenceProfileRepositoryDependencies) {
    this.cadenceProfileModel = deps?.cadenceProfileModel;
  }

  public static getInstance(deps?: CadenceProfileRepositoryDependencies): CadenceProfileRepository {
    if (!CadenceProfileRepository.instance || deps) {
      CadenceProfileRepository.instance = new CadenceProfileRepository(deps);
    }
    return CadenceProfileRepository.instance;
  }

  public setModel(model: any): void {
    this.cadenceProfileModel = model;
  }

  private async ensureModel(): Promise<void> {
    if (!this.cadenceProfileModel) {
      const { CadenceProfile } = await import(
        "../../../../../apps/web/server/db/models/CadenceProfile"
      );
      this.cadenceProfileModel = CadenceProfile;
    }
  }

  public async getProfile(userId: string): Promise<any | null> {
    await this.ensureModel();
    const query = this.cadenceProfileModel.findOne({ userId });
    return query && typeof query.lean === "function" ? await query.lean() : await query;
  }

  public async saveDayPatterns(
    userId: string,
    dayProfiles: Map<number, DayCadenceProfile>
  ): Promise<void> {
    await this.ensureModel();

    const dayPatterns = Array.from(dayProfiles.values()).map((p) => ({
      dayOfWeek: p.dayOfWeek,
      baselineWakeMinute: p.baselineWakeMinute,
      baselineSleepMinute: p.baselineSleepMinute,
      routines: p.routines.map((r) => ({
        category: r.category,
        title: r.title,
        targetStartMinute: r.targetStartMinute,
        targetEndMinute: r.targetEndMinute,
        durationMinutes: r.durationMinutes,
        elasticityRatio: r.elasticityRatio,
        confidence: r.confidence,
        varianceMinutes: r.varianceMinutes,
      })),
      preferredFocusWindows: p.preferredFocusWindows || [],
      commuteEstimates: p.commuteEstimates || [],
      sampleCount: p.sampleCount || 0,
    }));

    await this.cadenceProfileModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          dayPatterns,
          "metadata.lastDerivedAt": new Date(),
        },
      },
      { upsert: true, new: true }
    );
  }
}
