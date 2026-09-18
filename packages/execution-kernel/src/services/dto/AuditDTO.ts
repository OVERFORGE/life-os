export interface AuditReportDTO {
  schemaVersion: 1;
  topic: string;
  targetId?: string;
  explanation: string;
  evidence: string[];
  causalChain: string[];
  timestamp: number;
}
