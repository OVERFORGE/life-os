export interface InsightDTO {
  schemaVersion: 1;
  id: string;
  type: "state_insight" | "trend_insight" | "prediction_insight" | "learning_signal" | string;
  title: string;
  message: string;
  confidence?: number | string;
  evidence?: string[];
  category?: string;
}
