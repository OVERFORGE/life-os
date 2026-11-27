import {
  BaseChatModel,
  BaseChatModelCallOptions,
  BaseChatModelParams,
  LangSmithParams,
} from "@langchain/core/language_models/chat_models";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGenerationChunk, ChatResult } from "@langchain/core/outputs";
import type { RunnableConfig } from "@langchain/core/runnables";
import { groqChat, groqChatTextStream } from "../groq";
import { resolveGroqModel } from "../modelRegistry";

export interface LifeOSChatModelCallOptions extends BaseChatModelCallOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LifeOSChatModelParams extends BaseChatModelParams {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LifeOSMessageInput {
  role: "system" | "user" | "assistant";
  content: string;
}

function extractMessageText(message: BaseMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  return String(message.content ?? "");
}

export function toLifeOSMessages(messages: BaseMessage[]): LifeOSMessageInput[] {
  return messages.map((msg) => {
    const type = msg.getType();
    const role: "system" | "user" | "assistant" =
      type === "system"
        ? "system"
        : type === "ai"
          ? "assistant"
          : "user";
    return {
      role,
      content: extractMessageText(msg),
    };
  });
}

/**
 * LifeOSChatModel
 *
 * LangChain BaseChatModel adapter backed by LifeOS's resilient `groqChat` / `groqChatTextStream`
 * transport in `groq.ts`. Preserves Groq model fallback chains, Gemini fallback,
 * StreamingThinkSanitizer, AbortSignal propagation, rate-limit backoff, and test mocks.
 */
export class LifeOSChatModel extends BaseChatModel<LifeOSChatModelCallOptions> {
  model?: string;
  temperature: number;
  maxTokens: number;

  static lc_name() {
    return "LifeOSChatModel";
  }

  constructor(fields: LifeOSChatModelParams = {}) {
    super(fields);
    this.model = fields.model;
    this.temperature = fields.temperature ?? 0.2;
    this.maxTokens = fields.maxTokens ?? 1000;
  }

  _llmType(): string {
    return "lifeos_groq_gemini";
  }

  invocationParams(options?: this["ParsedCallOptions"]) {
    return {
      model: resolveGroqModel(options?.model ?? this.model),
      temperature: options?.temperature ?? this.temperature,
      max_tokens: options?.maxTokens ?? this.maxTokens,
    };
  }

  getLsParams(options: this["ParsedCallOptions"]): LangSmithParams {
    const params = this.invocationParams(options);
    return {
      ls_provider: "groq",
      ls_model_name: params.model,
      ls_model_type: "chat",
      ls_temperature: params.temperature,
      ls_max_tokens: params.max_tokens,
    };
  }

  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const params = this.invocationParams(options);
    const mapped = toLifeOSMessages(messages);
    const text = await groqChat({
      messages: mapped,
      model: params.model,
      temperature: params.temperature,
      max_tokens: params.max_tokens,
      signal: options?.signal,
    });

    if (text && runManager) {
      await runManager.handleLLMNewToken(text);
    }

    return {
      generations: [
        {
          text,
          message: new AIMessage({
            content: text,
            response_metadata: {
              model: params.model,
              provider: "lifeos_groq_gemini",
            },
          }),
        },
      ],
    };
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    const params = this.invocationParams(options);
    const mapped = toLifeOSMessages(messages);

    // Push-pull async queue so deltas yield immediately without buffering
    const queue: string[] = [];
    let notify: (() => void) | null = null;
    let done = false;
    let streamError: unknown = null;

    const wake = () => {
      if (notify) {
        const fn = notify;
        notify = null;
        fn();
      }
    };

    const runPromise = groqChatTextStream({
      messages: mapped,
      model: params.model,
      temperature: params.temperature,
      max_tokens: params.max_tokens,
      signal: options?.signal,
      onDelta: (delta) => {
        if (delta) {
          queue.push(delta);
          wake();
        }
      },
    })
      .then(() => {
        done = true;
        wake();
      })
      .catch((err) => {
        streamError = err;
        done = true;
        wake();
      });

    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
        continue;
      }

      const delta = queue.shift()!;
      if (runManager) {
        await runManager.handleLLMNewToken(delta);
      }
      yield new ChatGenerationChunk({
        text: delta,
        message: new AIMessageChunk({
          content: delta,
          response_metadata: {
            model: params.model,
            provider: "lifeos_groq_gemini",
          },
        }),
      });
    }

    await runPromise;
    if (streamError) {
      throw streamError;
    }
  }
}

export function toLangChainMessages(messages: LifeOSMessageInput[]): BaseMessage[] {
  return messages.map((msg) => {
    if (msg.role === "system") return new SystemMessage(msg.content);
    if (msg.role === "assistant") return new AIMessage(msg.content);
    return new HumanMessage(msg.content);
  });
}

export async function invokeLifeOSChat(params: {
  messages: LifeOSMessageInput[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  config?: RunnableConfig;
}): Promise<string> {
  const llm = new LifeOSChatModel({
    model: params.model,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });
  const aiMsg = await llm.invoke(toLangChainMessages(params.messages), {
    ...(params.config || {}),
    signal: params.signal,
  });
  return typeof aiMsg.content === "string"
    ? aiMsg.content
    : extractMessageText(aiMsg);
}

export async function streamLifeOSChat(params: {
  messages: LifeOSMessageInput[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void | Promise<void>;
  config?: RunnableConfig;
}): Promise<string> {
  const llm = new LifeOSChatModel({
    model: params.model,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });
  const stream = await llm.stream(toLangChainMessages(params.messages), {
    ...(params.config || {}),
    signal: params.signal,
  });
  let fullText = "";
  for await (const chunk of stream) {
    const delta = typeof chunk.content === "string" ? chunk.content : extractMessageText(chunk);
    if (delta) {
      fullText += delta;
      await params.onDelta?.(delta);
    }
  }
  return fullText;
}
