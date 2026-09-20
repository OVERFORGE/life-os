import { NextRequest } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export const dynamic = "force-dynamic";

/**
 * Sanitizes markdown, code blocks, XML tags, and formatting artifacts
 * so the neural voice reads clean, natural conversational English.
 */
function sanitizeForSpeech(rawText: string): string {
  if (!rawText) return "";

  let text = rawText;

  // 1. Remove XML/HTML tags, thinking blocks, DAG artifacts
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<planning>[\s\S]*?<\/planning>/gi, "");
  text = text.replace(/<[^>]+>/g, "");

  // 2. Remove code blocks entirely
  text = text.replace(/```[\s\S]*?```/g, "");

  // 3. Remove inline code backticks
  text = text.replace(/`([^`]+)`/g, "$1");

  // 4. Convert markdown links [title](url) to just title
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 5. Remove bold and italics formatting (* or _)
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/_([^_]+)_/g, "$1");

  // 6. Strip Markdown table structures cleanly so they don't corrupt speech
  text = text.replace(/\|[\s\-:|]+\|/g, " "); // Strip header/divider rows |---|---|
  text = text.replace(/\|/g, ", ");           // Convert cell separators to natural pauses

  // 7. Remove header markers, list bullets, blockquotes
  text = text.replace(/^[#>-]+\s+/gm, "");
  text = text.replace(/^[\s*\-•]+\s*/gm, "");
  text = text.replace(/^\s*\d+\.\s+/gm, "");

  // 8. Remove divider lines (---, ===, ***)
  text = text.replace(/^[-=*]{3,}\s*$/gm, "");

  // 9. Clean up repeated commas and whitespace
  text = text.replace(/,\s*,+/g, ",");
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

// Supported high-quality British neural voices (Jarvis aesthetic - LifeOS Voice)
const DEFAULT_VOICE = "en-GB-RyanNeural";
const ALLOWED_VOICES = new Set(["en-GB-RyanNeural"]);

async function handleSynthesize(text: string, voice?: string, rate?: string, pitch?: string) {
  const cleanText = sanitizeForSpeech(text);

  if (!cleanText) {
    return new Response(JSON.stringify({ error: "Empty or invalid text after sanitization" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const selectedVoice = voice && ALLOWED_VOICES.has(voice) ? voice : DEFAULT_VOICE;

  try {
    // Isolated MsEdgeTTS instance per synthesis to prevent concurrent WebSocket collision
    const tts = new MsEdgeTTS();
    await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(cleanText, {
      rate: rate || "+6%",
      pitch: pitch || "+0Hz",
    });

    const webStream = new ReadableStream({
      start(controller) {
        audioStream.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        audioStream.on("end", () => {
          try {
            tts.close();
          } catch (_) {}
          controller.close();
        });

        audioStream.on("error", (err: any) => {
          try {
            tts.close();
          } catch (_) {}
          controller.error(err);
        });
      },
      cancel() {
        try {
          tts.close();
        } catch (_) {}
      },
    });

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "x-lifeos-voice": selectedVoice,
      },
    });
  } catch (err: any) {
    console.error("[TTS_ERROR] Synthesis failed:", err);
    return new Response(JSON.stringify({ error: "TTS synthesis failed", details: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * GET /api/voice/tts?text=...&voice=...
 * Streaming endpoint ideal for HTML Audio and pre-fetching sentence queues
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text") || "";
  const voice = searchParams.get("voice") || undefined;
  const rate = searchParams.get("rate") || undefined;
  const pitch = searchParams.get("pitch") || undefined;

  return handleSynthesize(text, voice, rate, pitch);
}

/**
 * POST /api/voice/tts
 * Body: { text: string, voice?: string, rate?: string, pitch?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voice, rate, pitch } = body;
    return handleSynthesize(text, voice, rate, pitch);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
