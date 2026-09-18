import mongoose from "mongoose";

export interface EraData {
  _id?: string;
  userId: string;
  name: string;
  startDate: string;
  endDate?: string;
  focusDomain?: string;
  status: "active" | "completed";
}

export class EraRepository {
  private static instance: EraRepository;

  static getInstance(): EraRepository {
    if (!EraRepository.instance) {
      EraRepository.instance = new EraRepository();
    }
    return EraRepository.instance;
  }

  async findActiveEra(userId: string): Promise<EraData | null> {
    try {
      const EraModel = mongoose.models.Era;
      if (!EraModel) return null;

      const doc = await EraModel.findOne({ userId, status: "active" }).lean();
      return (doc as unknown as EraData) || null;
    } catch (error) {
      return null;
    }
  }
}
