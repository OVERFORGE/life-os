import { KernelAuditEngine, AuditQuestionInput } from "../diagnostics/KernelAuditEngine";
import { AuditReportDTO } from "./dto/AuditDTO";

export class AuditService {
  private static instance: AuditService;

  static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  getAuditReport(params: AuditQuestionInput): AuditReportDTO {
    const report = KernelAuditEngine.getInstance().generateAudit(params);

    return {
      schemaVersion: 1,
      topic: report.topic,
      targetId: report.targetId,
      explanation: report.explanation,
      evidence: report.evidence,
      causalChain: report.causalChain,
      timestamp: report.timestamp,
    };
  }
}
