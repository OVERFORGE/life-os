import { KernelEndpoints } from "./kernelEndpoints";
import {
  DashboardDTO,
  ExecutionGraphDTO,
  GoalDTO,
  WorldDTO,
  LearningDTO,
  DiagnosticsDTO,
  ConversationDTO,
  AuditReportDTO,
  InsightDTO,
  SettingsDTO,
  AssistantContextDTO,
} from "@life-os/execution-kernel";

/**
 * KernelClient Network Boundary
 * 
 * SOLE OWNER of HTTP communication between frontend clients and the Kernel API Layer.
 * Neither React components, Providers, nor Hooks call fetch() directly.
 */
export class KernelClient {
  private static async request<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });

    if (!res.ok) {
      let errorMessage = `HTTP Error ${res.status}`;
      try {
        const errorJson = await res.json();
        if (errorJson?.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch (_) {}
      throw new Error(errorMessage);
    }

    const payload = await res.json();
    if (payload.ok === false) {
      throw new Error(payload.error?.message || "Kernel API error");
    }

    return payload.data as T;
  }

  static async getDashboard(): Promise<DashboardDTO> {
    return this.request<DashboardDTO>(KernelEndpoints.dashboard);
  }

  static async getTasks(): Promise<ExecutionGraphDTO> {
    return this.request<ExecutionGraphDTO>(KernelEndpoints.tasks);
  }

  static async getGoals(): Promise<GoalDTO[]> {
    return this.request<GoalDTO[]>(KernelEndpoints.goals);
  }

  static async getWorld(): Promise<WorldDTO> {
    return this.request<WorldDTO>(KernelEndpoints.world);
  }

  static async getLearning(): Promise<LearningDTO> {
    return this.request<LearningDTO>(KernelEndpoints.learning);
  }

  static async getInsights(): Promise<InsightDTO[]> {
    return this.request<InsightDTO[]>(KernelEndpoints.insights);
  }

  static async getSettings(): Promise<SettingsDTO> {
    return this.request<SettingsDTO>(KernelEndpoints.settings);
  }

  static async getAssistantContext(): Promise<AssistantContextDTO> {
    return this.request<AssistantContextDTO>(KernelEndpoints.assistant);
  }

  static async getDiagnostics(requestId?: string): Promise<DiagnosticsDTO> {
    const url = requestId
      ? `${KernelEndpoints.diagnostics}?requestId=${encodeURIComponent(requestId)}`
      : KernelEndpoints.diagnostics;
    return this.request<DiagnosticsDTO>(url);
  }

  static async getConversation(conversationId: string = "default"): Promise<ConversationDTO> {
    const url = `${KernelEndpoints.conversation}?conversationId=${encodeURIComponent(conversationId)}`;
    return this.request<ConversationDTO>(url);
  }

  static async sendMessage(input: { message: string; model?: string; mode?: string }): Promise<Response> {
    const res = await fetch(KernelEndpoints.conversation, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      throw new Error(`Streaming request failed: ${res.statusText}`);
    }

    return res;
  }

  static async getAuditReport(params: {
    topic: string;
    targetId?: string;
    contextData?: Record<string, any>;
  }): Promise<AuditReportDTO> {
    return this.request<AuditReportDTO>(KernelEndpoints.audit, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }
}
