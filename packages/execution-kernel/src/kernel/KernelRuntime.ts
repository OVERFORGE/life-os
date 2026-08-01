import { ExecutionContext } from "../runtime/ExecutionContext";
import { EventBus } from "../events/EventBus";
import { createKernelEvent } from "../events/Event";
import { KernelEngine, HandleInput } from "./KernelEngine";

export class KernelRuntime {
  private static instance: KernelRuntime;
  private eventBus: EventBus;

  private constructor() {
    this.eventBus = EventBus.getInstance();
  }

  static getInstance(): KernelRuntime {
    if (!KernelRuntime.instance) {
      KernelRuntime.instance = new KernelRuntime();
    }
    return KernelRuntime.instance;
  }

  async initialize(): Promise<void> {
    await KernelEngine.initialize();
  }

  async runAutomation(userId: string) {
    return await KernelEngine.runAutomation(userId);
  }

  async handle(input: HandleInput): Promise<Response> {
    // 1. Create ExecutionContext
    const context = new ExecutionContext({
      userId: input.userId,
      mode: input.mode,
    });

    // 2. Emit descriptive lifecycle event: chat_received
    this.eventBus.publish(
      createKernelEvent(
        "kernel.chat_received",
        "web_adapter",
        { message: input.message },
        { executionId: context.executionId, userId: context.userId }
      )
    );

    try {
      // 3. Invoke KernelEngine with context
      const response = await KernelEngine.handle(input, context);

      // 4. Emit lifecycle event: execution_completed
      this.eventBus.publish(
        createKernelEvent(
          "kernel.execution_completed",
          "kernel_runtime",
          { success: true },
          { executionId: context.executionId, userId: context.userId }
        )
      );

      return response;
    } catch (err: any) {
      this.eventBus.publish(
        createKernelEvent(
          "kernel.execution_failed",
          "kernel_runtime",
          { error: err.message },
          { executionId: context.executionId, userId: context.userId }
        )
      );
      throw err;
    }
  }
}
