import mongoose from "mongoose";
import { ConversationManager } from "../kernel/ConversationManager";
import { KernelEngine, HandleInput } from "../kernel/KernelEngine";
import { ConversationDTO } from "./dto/ConversationDTO";
import { Supervisor, SupervisorResponse } from "../orchestration/supervisor/Supervisor";
import { runAutomation } from "../automation/automationEngine";
import { DurableMemoryJobQueue } from "../memory/DurableMemoryJobQueue";

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
        timestamp: m.timestamp || Date.now(),
      })),
      activeEntity: loaded.stm?.activeEntity,
      pendingConfirmationsCount: loaded.stm?.pendingConfirmations?.length || 0,
    };
  }

  /**
   * Structured V3 execution for tests and deep orchestration inspectors
   */
  async executeUserRequestV3(input: HandleInput): Promise<SupervisorResponse> {
    return await this.supervisor.processRequest({
      userId: input.userId,
      conversationId: input.conversationId,
      message: input.message,
    });
  }

  /**
   * Standard Web streaming endpoint integration (POST /api/conversation)
   * Dispatches request to the V3 Chief of Staff Supervisor and returns standard Web Response
   */
  async executeUserRequest(input: HandleInput): Promise<Response> {
    try {
      const supervisorResult = await this.executeUserRequestV3(input);

      // Persist conversation turn in ConversationManager for history parity (if DB connected)
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        try {
          await ConversationManager.getInstance().persist({
            conversationId: input.conversationId || "default",
            userId: input.userId,
            userMessage: input.message,
            assistantResponse: supervisorResult.response,
            stmUpdates: {},
          });
        } catch (persistErr) {
          console.error("ConversationManager.persist warning:", persistErr);
        }

        // Background automations
        try {
          await runAutomation(input.userId);
        } catch (autoErr) {
          console.error("Background automation warning:", autoErr);
        }
      }

      // Out-of-band asynchronous memory formation via DurableMemoryJobQueue (Requirements 11, 12, 13)
      DurableMemoryJobQueue.getInstance()
        .enqueueTurn({
          userId: input.userId,
          userMessage: input.message,
          assistantResponse: supervisorResult.response,
          conversationId: input.conversationId,
        })
        .catch((queueErr) => {
          console.warn("[CONVERSATION_SERVICE] Memory queue enqueue warning:", queueErr);
        });

      // Return Web-compatible streaming response
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(supervisorResult.response));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "x-lifeos-request-id": supervisorResult.requestId || "",
          "x-lifeos-route": supervisorResult.routingDecision.strategy,
          "x-lifeos-execution-id": supervisorResult.executionId,
          "x-lifeos-memory-snapshot-id": supervisorResult.executionId,
          "x-lifeos-duration-ms": String(supervisorResult.durationMs),
          "x-lifeos-actions-count": String(supervisorResult.actionsExecuted),
          "x-lifeos-termination-reason": supervisorResult.terminationReason || "COMPLETED",
        },
      });
    } catch (err: any) {
      console.warn("V3 Supervisor encountered an error, evaluating legacy fallback:", err);
      // Fallback to legacy KernelEngine if enabled
      return KernelEngine.handle(input);
    }
  }
}
