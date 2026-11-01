/**
 * ConstraintProfileRepository.ts
 * 
 * Milestone B — Phase B3: Work Package 3 / Loop 6
 * Dynamic Constraint Memory & Schedule Solver Injection Repository
 */

export interface ConstraintProfileRepositoryDependencies {
  constraintProfileModel?: any;
}

export class ConstraintProfileRepository {
  private static instance: ConstraintProfileRepository;
  private constraintProfileModel: any;

  constructor(deps?: ConstraintProfileRepositoryDependencies) {
    this.constraintProfileModel = deps?.constraintProfileModel;
  }

  public static getInstance(deps?: ConstraintProfileRepositoryDependencies): ConstraintProfileRepository {
    if (!ConstraintProfileRepository.instance || deps) {
      ConstraintProfileRepository.instance = new ConstraintProfileRepository(deps);
    }
    return ConstraintProfileRepository.instance;
  }

  public setModel(model: any): void {
    this.constraintProfileModel = model;
  }

  private async ensureModel(): Promise<void> {
    if (!this.constraintProfileModel) {
      const { ConstraintProfile } = await import(
        "../../../../../apps/web/server/db/models/ConstraintProfile"
      );
      this.constraintProfileModel = ConstraintProfile;
    }
  }

  public async getProfile(userId: string): Promise<any | null> {
    await this.ensureModel();
    const query = this.constraintProfileModel.findOne({ userId });
    return query && typeof query.lean === "function" ? await query.lean() : await query;
  }

  public async saveProfile(userId: string, data: Record<string, any>): Promise<void> {
    await this.ensureModel();
    await this.constraintProfileModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          ...data,
          "metadata.lastUpdated": new Date(),
        },
      },
      { upsert: true, new: true }
    );
  }

  public async getLearnedFocusWindows(
    userId: string
  ): Promise<Array<{ startMinute: number; endMinute: number; score: number }>> {
    const profile = await this.getProfile(userId);
    if (!profile) return [];
    return profile.availabilityWindows || [];
  }
}
