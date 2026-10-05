import mongoose from "mongoose";
import { ConversationManager } from "../kernel/ConversationManager";
import { KernelEngine, HandleInput } from "../kernel/KernelEngine";
import { ConversationDTO } from "./dto/ConversationDTO";
import { Supervisor, SupervisorResponse } from "../orchestration/supervisor/Supervisor";
import { runAutomation } from "../automation/automationEngine";
import { DurableMemoryJobQueue } from "../memory/DurableMemoryJobQueue";
import { AvenStreamEvent } from "../orchestration/contracts/AvenStreamContracts";

export class ConversationService {
  private static instance: ConversationService;
  private supervisor: Supervisor;

  constructor(supervisor?: Supervisor) {
    this.supervisor = supervisor || Supervisor.getInstance();
  }

  static getInstance(): ConversationService {
    if (!ConversationService.instance) {
      ConversationService.instance = new ConversationService();
    }
    return ConversationService.instance;
  }

  async getConversation(conversationId: string, userId: string): Promise<ConversationDTO> {
    const loaded = await ConversationManager.getInstance().load(conversationId, userId);
    const conv = loaded.conversation as any;

    return {
      schemaVersion: 1,
      conversationId: conv?.conversationId || conv?._id || conversationId,
      userId,
      title: conv?.title || "Conversation",
      summary: conv?.summary,
      recentMessages: loaded.recentMessages.map((m: any, idx: number) => ({
        id: m.id || m._id || `msg_${idx}`,
        role: m.role as any,
        content: m.content,
        timestamp: m.timestamp || (m.createdAt ? new Date(m.createdAt).getTime() : Date.now()),
        toolActivities: m.toolActivities,
      })),
      activeEntity: loaded.stm?.activeEntity,
      pendingConfirmationsCount: loaded.stm?.pendingConfirmations?.length || 0,
    };
  }

  /**
   * Structured V3 execution for tests and deep orchestration inspectors
   */
  async executeUserRequestV3(input: HandleInput): Promise<SupervisorResponse> {
    const res = await this.supervisor.processRequest({
      userId: input.userId,
      userName: input.userName,
      conversationId: input.conversationId,
      message: input.message,
      timezone: input.timezone,
      referenceTimeMs: input.referenceTimeMs,
    });
    this.persistTurnAsync(
      input,
      res.response,
      res.stmUpdates,
      undefined,
      undefined,
      res.pendingOperation?.state === "AWAITING_CONFIRMATION" ? {
        actionId: res.pendingOperation.operationId,
        title: `Allow Access?`,
        description: res.response,
        confirmLabel: "Allow",
        cancelLabel: "Deny",
      } : undefined
    );
    return res;
  }

  /**
   * Standard Web streaming endpoint integration (POST /api/conversation)
   * Dispatches request to the V3 Chief of Staff Supervisor and returns standard Web Response
   */
  async executeUserRequest(input: HandleInput): Promise<Response> {
    try {
      // Canonical V2/V3 Execution: Route 100% of user utterances through Supervisor
      const encoder = new TextEncoder();
      let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
      const isEventsFormat = input.streamFormat === "events";

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
        },
      });

      const sendEvent = (event: AvenStreamEvent) => {
        if (streamController) {
          try {
            if (isEventsFormat) {
              streamController.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (event.type === "assistant_delta") {
              streamController.enqueue(encoder.encode(event.text));
            }
          } catch (e) {
            // Stream might be closed if client disconnected
          }
        }
      };

      const executedActivities: any[] = [];
      let capturedMissingConnection: any = undefined;
      let capturedConfirmation: any = undefined;

      // Launch supervisor execution with real-time progressive chunking and events
      this.supervisor
        .processRequest({
          userId: input.userId,
          userName: input.userName,
          conversationId: input.conversationId,
          message: input.message,
          timezone: input.timezone,
          referenceTimeMs: input.referenceTimeMs,
          onChunk: (chunk: string) => {
            if (!isEventsFormat && streamController && chunk) {
              try {
                streamController.enqueue(encoder.encode(chunk));
              } catch (e) {
                // Stream closed
              }
            }
          },
          onEvent: (event: AvenStreamEvent) => {
            if (event.type === "tool_activity") {
              const act = event as any;
              const idx = executedActivities.findIndex(
                (a) => a.capabilityURN === act.capabilityURN && a.providerId === act.providerId
              );
              const activityRecord = {
                id: `${act.providerId}_${act.capabilityURN}`,
                providerId: act.providerId,
                providerDisplayName: act.providerDisplayName,
                capabilityURN: act.capabilityURN,
                iconName: act.iconName,
                humanMessage: act.humanMessage,
                state: act.state,
                error: act.error,
                details: act.details,
              };
              if (idx !== -1) {
                executedActivities[idx] = activityRecord;
              } else {
                executedActivities.push(activityRecord);
              }
            } else if (event.type === "missing_connection") {
              const mc = event as any;
              capturedMissingConnection = {
                providerId: mc.providerId,
                providerDisplayName: mc.providerDisplayName,
                capabilityURN: mc.capabilityURN,
                message: mc.message,
                connectUrl: mc.connectUrl,
                iconName: mc.iconName,
              };
            } else if ((event as any).type === "confirmation" || (event as any).type === "confirmation_required") {
              const conf = event as any;
              capturedConfirmation = {
                actionId: conf.actionId,
                title: conf.title,
                description: conf.description || conf.message,
                message: conf.message || conf.description,
                details: conf.details,
                impactSummary: conf.impactSummary,
                riskClass: conf.riskClass,
                previewData: conf.previewData,
                confirmLabel: conf.confirmLabel || "Allow",
                cancelLabel: conf.cancelLabel || "Deny",
              };
            }
            sendEvent(event);
          },
        })
        .then((result) => {
          if (isEventsFormat) {
            sendEvent({ type: "status", status: "completed", message: "Completed" });
          }
          try {
            streamController?.close();
          } catch (_) {}
          this.persistTurnAsync(
            input,
            result.response,
            result.stmUpdates,
            executedActivities,
            capturedMissingConnection,
            capturedConfirmation
          );
        })
        .catch((err) => {
          console.error("[CONVERSATION_SERVICE] Async execution error:", err);
          if (isEventsFormat) {
            sendEvent({ type: "error", message: err.message || "Execution encountered an error" });
          }
          try {
            streamController?.error(err);
          } catch (_) {}
        });

      return new Response(stream, {
        headers: {
          "Content-Type": isEventsFormat ? "text/event-stream; charset=utf-8" : "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "x-lifeos-route": "CANONICAL_SEMANTIC",
        },
      });
    } catch (err: any) {
      console.error("[CONVERSATION_SERVICE] Fatal routing error:", err);
      throw err;
    }
  }

  private persistTurnAsync(
    input: HandleInput,
    response: string,
    stmUpdates?: Record<string, any>,
    toolActivities?: any[],
    missingConnection?: any,
    confirmation?: any
  ): void {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      Promise.all([
        ConversationManager.getInstance().persist({
          conversationId: input.conversationId || "default",
          userId: input.userId,
          userMessage: input.message,
          assistantResponse: response,
          stmUpdates: stmUpdates || {},
          toolActivities: toolActivities && toolActivities.length > 0 ? toolActivities : undefined,
          missingConnection,
          confirmation,
        }).catch((persistErr) => {
          console.error("ConversationManager.persist warning:", persistErr);
        }),
        runAutomation(input.userId).catch((autoErr) => {
          console.error("Background automation warning:", autoErr);
        }),
      ]).catch(() => {});
    }

    DurableMemoryJobQueue.getInstance()
      .enqueueTurn({
        userId: input.userId,
        userMessage: input.message,
        assistantResponse: response,
        conversationId: input.conversationId,
      })
      .catch((queueErr) => {
        console.warn("[CONVERSATION_SERVICE] Memory queue enqueue warning:", queueErr);
      });
  }
}
