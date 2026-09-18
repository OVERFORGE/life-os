import { KernelDiagnosticsEngine } from "../diagnostics/KernelDiagnosticsEngine";
import { KernelTraceEngine } from "../diagnostics/KernelTraceEngine";
import { DiagnosticsDTO } from "./dto/DiagnosticsDTO";
import { DiagnosticsDTOMapper } from "./mappers/DiagnosticsDTOMapper";

export class DiagnosticsService {
  private static instance: DiagnosticsService;

  static getInstance(): DiagnosticsService {
    if (!DiagnosticsService.instance) {
      DiagnosticsService.instance = new DiagnosticsService();
    }
    return DiagnosticsService.instance;
  }

  getDiagnostics(requestId: string = "diag_service"): DiagnosticsDTO {
    const traceEngine = new KernelTraceEngine();
    const snapshot = KernelDiagnosticsEngine.getInstance().generateSnapshot({
      requestId,
      totalDurationMs: 0,
      traceEngine,
    });

    return DiagnosticsDTOMapper.toDiagnosticsDTO(snapshot);
  }
}
