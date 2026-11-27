import crypto from "node:crypto";
import mongoose from "mongoose";
import { ConversationManager } from "../kernel/ConversationManager";
import { KernelEngine, HandleInput } from "../kernel/KernelEngine";
import { ConversationDTO } from "./dto/ConversationDTO";
import { Supervisor, SupervisorResponse } from "../orchestration/supervisor/Supervisor";
import { runAutomation } from "../automation/automationEngine";
import { DurableMemoryJobQueue } from "../memory/DurableMemoryJobQueue";
import {
  AvenStreamEvent,
  createStreamTerminalGuard,
} from "../orchestration/contracts/AvenStreamContracts";
import { isAbortError, StreamInterruptedError } from "../shared/groq";
import {
  createTraceContext,
  runWithTraceContext,
  recordTraceStep,
} from "../orchestration/observability/TraceContext";
import {
  buildLangSmithRunUrl,
  isLangSmithEnabled,
  syncLangSmithEnv,
} from "../orchestration/observability/LangSmithBridge";
import { TracePersistenceService } from "../orchestration/observability/TracePersistenceService";
import { generateId } from "../shared/ids";

export class ConversationService {
  private static instance: ConversationService;
  private supervisor: Supervisor;
  private inFlightRequests = new Map<string, AbortController>();

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
    const requestId = input.requestId || res.requestId || `req_${crypto.randomUUID()}`;
    await this.persistCoreTurnSync({
      input,
      requestId,
      executionId: res.executionId,
      response: res.response,
      status: res.pendingOperation?.state === "AWAITING_CONFIRMATION" ? "waiting_for_confirmation" : "completed",
      stmUpdates: res.stmUpdates,
      confirmation:
        res.pendingOperation?.state === "AWAITING_CONFIRMATION"
          ? {
            actionId: res.pendingOperation.operationId,
            title: `Allow Access?`,
            description: res.response,
            confirmLabel: "Allow",
            cancelLabel: "Deny",
          }
          : undefined,
    });
    this.triggerBackgroundPostCommitTasks(input, res.response, requestId, res.semanticTurnMeta);
    return res;
  }

  /**
   * Standard Web streaming endpoint integration (POST /api/conversation)
   * Dispatches request to the V3 Chief of Staff Supervisor and returns standard Web Response
   */
  async executeUserRequest(input: HandleInput): Promise<Response> {
    try {
      const startedAtMs = Date.now();
      const routingDecision = this.supervisor.getRouter?.()?.route(input.message);
      const isFastPath = routingDecision?.strategy === "FAST_PATH";
      const isEventsFormat = input.streamFormat === "events";
      const convId = input.conversationId || "default";
      const explicitRequestId = input.requestId?.trim();
      const requestId = explicitRequestId || `req_${crypto.randomUUID()}`;
      const preAllocatedExecutionId = `exec_${crypto.randomUUID()}`;
      const memorySnapshotId = `snap_${preAllocatedExecutionId}`;
      const dedupeKey = `${input.userId}:${convId}:${requestId}`;

      // 1. Idempotency: reject concurrent duplicate in-flight requestId
      if (explicitRequestId && this.inFlightRequests.has(dedupeKey)) {
        return Response.json(
          { error: "Request already in flight", code: "REQUEST_IN_FLIGHT", requestId },
          { status: 409 }
        );
      }

      // 2. Idempotency: replay finalized turn deterministically if requestId already persisted
      if (explicitRequestId) {
        const existing = await ConversationManager.getInstance().findPersistedAssistantByRequestId(
          input.userId,
          convId,
          requestId
        );
        if (existing) {
          const encoder = new TextEncoder();
          const replayText = existing.content || "";
          const replayStatus = existing.status || "completed";
          const replayStream = new ReadableStream<Uint8Array>({
            start(controller) {
              if (isEventsFormat) {
                let seq = 0;
                const push = (ev: any) => {
                  seq += 1;
                  controller.enqueue(
                    encoder.encode(
                      `id: ${seq}\ndata: ${JSON.stringify({
                        ...ev,
                        requestId,
                        executionId: existing.executionId,
                        seq,
                        timestamp: Date.now(),
                      })}\n\n`
                    )
                  );
                };
                if (replayText) {
                  push({ type: "assistant_delta", text: replayText });
                }
                push({ type: "assistant_final", text: replayText, persisted: true });
                push({
                  type: "status",
                  status: replayStatus,
                  message: replayStatus === "completed" ? "Completed" : `Replayed (${replayStatus})`,
                });
              } else if (replayText) {
                controller.enqueue(encoder.encode(replayText));
              }
              controller.close();
            },
          });
          return new Response(replayStream, {
            headers: {
              "Content-Type": isEventsFormat ? "text/event-stream; charset=utf-8" : "text/plain; charset=utf-8",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              "x-lifeos-request-id": requestId,
              "x-lifeos-execution-id": existing.executionId || preAllocatedExecutionId,
              "x-lifeos-memory-snapshot-id": memorySnapshotId,
              "x-lifeos-duration-ms": String(Math.max(1, Date.now() - startedAtMs)),
              "x-lifeos-route": isFastPath ? "FAST_PATH" : "CANONICAL_SEMANTIC",
              "x-lifeos-replayed": "true",
            },
          });
        }
      }

      const encoder = new TextEncoder();
      let streamController = null as ReadableStreamDefaultController<Uint8Array> | null;
      const getController = (): ReadableStreamDefaultController<Uint8Array> | null => streamController;
      const requestAbortController = new AbortController();
      this.inFlightRequests.set(dedupeKey, requestAbortController);

      const onReqAbort = () => {
        requestAbortController.abort(input.abortSignal?.reason || "client_disconnected");
      };
      if (input.abortSignal) {
        if (input.abortSignal.aborted) {
          requestAbortController.abort(input.abortSignal.reason || "client_disconnected");
        } else {
          input.abortSignal.addEventListener("abort", onReqAbort, { once: true });
        }
      }

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
        },
        cancel(reason) {
          requestAbortController.abort(reason || "client_disconnected");
        },
      });

      let seq = 0;
      let executionId: string | undefined = preAllocatedExecutionId;
      let streamedText = "";
      let hasExecutedToolOrStep = false;
      const terminalGuard = createStreamTerminalGuard();

      const sendEvent = (event: AvenStreamEvent) => {
        if (!streamController || !isEventsFormat || terminalGuard.terminated) {
          return;
        }
        try {
          seq += 1;
          const framed = {
            ...event,
            requestId,
            executionId: event.executionId || executionId,
            seq,
            timestamp: event.timestamp || Date.now(),
          };
          streamController.enqueue(encoder.encode(`id: ${seq}\ndata: ${JSON.stringify(framed)}\n\n`));
        } catch (_) {
          // Stream might be closed if client disconnected
        }
      };

      const keepaliveTimer = isEventsFormat
        ? setInterval(() => {
          if (streamController && !terminalGuard.terminated) {
            try {
              streamController.enqueue(encoder.encode(`: keepalive\n\n`));
            } catch (_) { }
          }
        }, 15000)
        : null;

      const executedActivities: any[] = [];
      let capturedMissingConnection: any = undefined;
      let capturedConfirmation: any = undefined;

      const langsmithActive = isLangSmithEnabled();
      if (langsmithActive) syncLangSmithEnv();
      const langsmithRunId = langsmithActive ? generateId("ls") : undefined;
      const rootTraceCtx = createTraceContext({
        requestId,
        executionId: preAllocatedExecutionId,
        conversationId: input.conversationId,
        userId: input.userId,
        surface:
          input.surfaceContext?.sourceSurface === "DESKTOP_HUD"
            ? "desktop_hud"
            : input.surfaceContext?.sourceSurface === "VOICE"
              ? "voice"
              : "aven_chat",
        langsmithRunId,
        langsmithUrl: langsmithRunId ? buildLangSmithRunUrl(langsmithRunId) : undefined,
      });

      (async () => {
        let traceStatus: "COMPLETED" | "AWAITING_CONFIRMATION" | "AWAITING_CLARIFICATION" | "FAILED" = "COMPLETED";
        let traceRoutingStrategy: string | undefined;
        let traceTerminationReason: string | undefined;
        let traceFinalResponse = "";
        let traceFrontendPayload: any = undefined;

        await runWithTraceContext(rootTraceCtx, async () => {
        recordTraceStep({
          layer: "ingress",
          component: "ConversationService",
          operation: "executeUserRequest",
          status: "COMPLETED",
          startedAtMs: rootTraceCtx.startedAtMs,
          durationMs: 0,
          inputs: {
            streamFormat: isEventsFormat ? "events" : "raw",
            surface: rootTraceCtx.surface,
            conversationId: input.conversationId,
          },
        });
        try {
          const result = await this.supervisor.processRequest({
            requestId,
            executionId: preAllocatedExecutionId,
            userId: input.userId,
            userName: input.userName,
            conversationId: input.conversationId,
            message: input.message,
            timezone: input.timezone,
            referenceTimeMs: input.referenceTimeMs,
            abortSignal: requestAbortController.signal,
            streamMode: isEventsFormat ? "events" : "raw",
            onChunk: (chunk: string) => {
              if (!isEventsFormat && streamController && chunk && !terminalGuard.terminated) {
                streamedText += chunk;
                try {
                  streamController.enqueue(encoder.encode(chunk));
                } catch (_) { }
              }
            },
            onEvent: (event: AvenStreamEvent) => {
              if (event.executionId) {
                executionId = event.executionId;
              }
              if (event.type === "assistant_delta" && event.text) {
                streamedText += event.text;
              } else if (event.type === "step_progress") {
                hasExecutedToolOrStep = true;
              } else if (event.type === "tool_activity") {
                hasExecutedToolOrStep = true;
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
          });

          executionId = result.executionId;
          rootTraceCtx.executionId = executionId;
          traceRoutingStrategy = result.routingDecision?.strategy;
          traceTerminationReason = result.terminationReason;
          const isCancelled =
            result.workspaceStatus === "CANCELLED_BY_USER" ||
            result.terminationReason === "USER_CANCELLED" ||
            requestAbortController.signal.aborted;

          if (isCancelled) {
            const partialText = (result.response || streamedText).trim();
            let persisted = false;
            if (partialText.length > 0 || hasExecutedToolOrStep || result.actionsExecuted > 0) {
              persisted = await this.persistCoreTurnSync({
                input,
                requestId,
                executionId,
                response: partialText,
                status: "cancelled",
                stmUpdates: result.stmUpdates,
                toolActivities: executedActivities,
                missingConnection: capturedMissingConnection,
                confirmation: capturedConfirmation,
              });
            }
            if (isEventsFormat && terminalGuard.tryFinalize("cancelled")) {
              sendEventUnsafe();
              function sendEventUnsafe() {
                if (!streamController) return;
                seq += 1;
                streamController.enqueue(
                  encoder.encode(
                    `id: ${seq}\ndata: ${JSON.stringify({
                      type: "cancelled",
                      reason: "user_aborted",
                      partialText: partialText || undefined,
                      persisted,
                      requestId,
                      executionId,
                      seq,
                      timestamp: Date.now(),
                    })}\n\n`
                  )
                );
                seq += 1;
                streamController.enqueue(
                  encoder.encode(
                    `id: ${seq}\ndata: ${JSON.stringify({
                      type: "status",
                      status: "cancelled",
                      message: "Cancelled",
                      requestId,
                      executionId,
                      seq,
                      timestamp: Date.now(),
                    })}\n\n`
                  )
                );
              }
            }
            try {
              streamController?.close();
            } catch (_) { }
            return;
          }

          const isWaitingConfirmation =
            result.terminationReason === "AWAITING_CONFIRMATION" ||
            result.workspaceStatus === "PAUSED_AWAITING_CONFIRMATION" ||
            result.workspaceStatus === "WAITING_FOR_APPROVAL" ||
            Boolean(capturedConfirmation);
          const turnStatus = isWaitingConfirmation ? "waiting_for_confirmation" : "completed";
          const finalText = (result.response || streamedText).trim();
          traceStatus = isWaitingConfirmation
            ? "AWAITING_CONFIRMATION"
            : result.terminationReason === "AWAITING_CLARIFICATION"
              ? "AWAITING_CLARIFICATION"
              : "COMPLETED";
          traceFinalResponse = finalText;
          traceFrontendPayload = {
            status: turnStatus,
            text: finalText,
            toolActivities: executedActivities,
            missingConnection: capturedMissingConnection,
            confirmation: capturedConfirmation,
          };

          const persisted = await this.persistCoreTurnSync({
            input,
            requestId,
            executionId,
            response: finalText,
            status: turnStatus,
            stmUpdates: result.stmUpdates,
            toolActivities: executedActivities,
            missingConnection: capturedMissingConnection,
            confirmation: capturedConfirmation,
          });

          if (isEventsFormat && terminalGuard.tryFinalize(turnStatus)) {
            if (streamController) {
              seq += 1;
              streamController.enqueue(
                encoder.encode(
                  `id: ${seq}\ndata: ${JSON.stringify({
                    type: "assistant_final",
                    text: finalText,
                    persisted,
                    requestId,
                    executionId,
                    seq,
                    timestamp: Date.now(),
                  })}\n\n`
                )
              );
              seq += 1;
              streamController.enqueue(
                encoder.encode(
                  `id: ${seq}\ndata: ${JSON.stringify({
                    type: "status",
                    status: turnStatus,
                    message: isWaitingConfirmation ? "Awaiting confirmation" : "Completed",
                    requestId,
                    executionId,
                    seq,
                    timestamp: Date.now(),
                  })}\n\n`
                )
              );
            }
          }
          try {
            streamController?.close();
          } catch (_) { }

          this.triggerBackgroundPostCommitTasks(input, finalText, requestId, result.semanticTurnMeta);
        } catch (err: any) {
          traceStatus = "FAILED";
          traceTerminationReason = isAbortError(err) ? "CANCELLED_BY_USER" : "ERROR";
          const isAbort = isAbortError(err) || requestAbortController.signal.aborted;
          const partialText = (err instanceof StreamInterruptedError ? err.partialText : streamedText).trim();

          if (isAbort) {
            let persisted = false;
            if (partialText.length > 0 || hasExecutedToolOrStep) {
              persisted = await this.persistCoreTurnSync({
                input,
                requestId,
                executionId,
                response: partialText,
                status: "cancelled",
                toolActivities: executedActivities,
                missingConnection: capturedMissingConnection,
                confirmation: capturedConfirmation,
              });
            }
            if (isEventsFormat && terminalGuard.tryFinalize("cancelled") && streamController) {
              try {
                seq += 1;
                streamController.enqueue(
                  encoder.encode(
                    `id: ${seq}\ndata: ${JSON.stringify({
                      type: "cancelled",
                      reason:
                        requestAbortController.signal.reason === "client_disconnected"
                          ? "client_disconnected"
                          : "user_aborted",
                      partialText: partialText || undefined,
                      persisted,
                      requestId,
                      executionId,
                      seq,
                      timestamp: Date.now(),
                    })}\n\n`
                  )
                );
                seq += 1;
                streamController.enqueue(
                  encoder.encode(
                    `id: ${seq}\ndata: ${JSON.stringify({
                      type: "status",
                      status: "cancelled",
                      message: "Cancelled",
                      requestId,
                      executionId,
                      seq,
                      timestamp: Date.now(),
                    })}\n\n`
                  )
                );
              } catch (_) { }
            }
            try {
              streamController?.close();
            } catch (_) { }
            return;
          }

          console.error("[CONVERSATION_SERVICE] Async execution error:", err);
          const errMsg = err?.message || "Execution encountered an error";
          let persisted = false;
          if (partialText.length > 0 || hasExecutedToolOrStep) {
            persisted = await this.persistCoreTurnSync({
              input,
              requestId,
              executionId,
              response: partialText || errMsg,
              status: "failed",
              toolActivities: executedActivities,
              missingConnection: capturedMissingConnection,
              confirmation: capturedConfirmation,
            });
          }

          if (isEventsFormat && terminalGuard.tryFinalize("failed") && streamController) {
            try {
              seq += 1;
              streamController.enqueue(
                encoder.encode(
                  `id: ${seq}\ndata: ${JSON.stringify({
                    type: "error",
                    message: errMsg,
                    code: err instanceof StreamInterruptedError ? "STREAM_INTERRUPTED" : "EXECUTION_ERROR",
                    recoverable: false,
                    persisted,
                    partialText: partialText || undefined,
                    requestId,
                    executionId,
                    seq,
                    timestamp: Date.now(),
                  })}\n\n`
                )
              );
              seq += 1;
              streamController.enqueue(
                encoder.encode(
                  `id: ${seq}\ndata: ${JSON.stringify({
                    type: "status",
                    status: "failed",
                    message: errMsg,
                    requestId,
                    executionId,
                    seq,
                    timestamp: Date.now(),
                  })}\n\n`
                )
              );
            } catch (_) { }
          }
          try {
            streamController?.close();
          } catch (_) { }
        } finally {
          if (keepaliveTimer) clearInterval(keepaliveTimer);
          input.abortSignal?.removeEventListener("abort", onReqAbort);
          this.inFlightRequests.delete(dedupeKey);
          await TracePersistenceService.getInstance().persistTrace({
            ctx: rootTraceCtx,
            status: traceStatus,
            routingStrategy: traceRoutingStrategy,
            terminationReason: traceTerminationReason,
            userMessage: input.message,
            finalResponse: traceFinalResponse || streamedText,
            finalFrontendPayload: traceFrontendPayload || {
              text: streamedText,
              toolActivities: executedActivities,
              missingConnection: capturedMissingConnection,
              confirmation: capturedConfirmation,
            },
          });
        }
        });
      })();

      return new Response(stream, {
        headers: {
          "Content-Type": isEventsFormat ? "text/event-stream; charset=utf-8" : "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "x-lifeos-request-id": requestId,
          "x-lifeos-execution-id": preAllocatedExecutionId,
          "x-lifeos-memory-snapshot-id": memorySnapshotId,
          "x-lifeos-duration-ms": String(Math.max(1, Date.now() - startedAtMs)),
          "x-lifeos-route": isFastPath ? "FAST_PATH" : "CANONICAL_SEMANTIC",
          "x-lifeos-actions-count": isFastPath ? "1" : "0",
        },
      });
    } catch (err: any) {
      console.error("[CONVERSATION_SERVICE] Fatal routing error:", err);
      throw err;
    }
  }

  private async persistCoreTurnSync(params: {
    input: HandleInput;
    requestId: string;
    executionId?: string;
    response: string;
    status: "completed" | "cancelled" | "failed" | "waiting_for_confirmation";
    stmUpdates?: Record<string, any>;
    toolActivities?: any[];
    missingConnection?: any;
    confirmation?: any;
  }): Promise<boolean> {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return false;
    }
    try {
      await ConversationManager.getInstance().persist({
        conversationId: params.input.conversationId || "default",
        userId: params.input.userId,
        userMessage: params.input.message,
        assistantResponse: params.response,
        requestId: params.requestId,
        executionId: params.executionId,
        status: params.status,
        stmUpdates: params.stmUpdates || {},
        toolActivities:
          params.toolActivities && params.toolActivities.length > 0 ? params.toolActivities : undefined,
        missingConnection: params.missingConnection,
        confirmation: params.confirmation,
      });
      return true;
    } catch (persistErr) {
      console.error("ConversationManager.persist error:", persistErr);
      return false;
    }
  }

  private triggerBackgroundPostCommitTasks(
    input: HandleInput,
    response: string,
    requestId?: string,
    semanticTurnMeta?: {
      primaryClassification?: string;
      operationsCount?: number;
      hasOperations?: boolean;
    }
  ): void {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      runAutomation(input.userId).catch((autoErr) => {
        console.error("Background automation warning:", autoErr);
      });
    }

    DurableMemoryJobQueue.getInstance()
      .enqueueTurn({
        userId: input.userId,
        userMessage: input.message,
        assistantResponse: response,
        conversationId: input.conversationId,
        requestId,
        semanticTurnMeta,
      })
      .catch((queueErr) => {
        console.warn("[CONVERSATION_SERVICE] Memory queue enqueue warning:", queueErr);
      });
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
      ]).catch(() => { });
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
