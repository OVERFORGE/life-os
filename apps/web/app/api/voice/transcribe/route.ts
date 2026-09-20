import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import Groq from "groq-sdk";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    const isDev = process.env.NODE_ENV !== "production";

    if (!(session?.user as any)?.id && !isDev) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in to transcribe voice." },
        { status: 401 }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error("[VOICE_TRANSCRIBE] GROQ_API_KEY environment variable is not configured.");
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const groq = new Groq({ apiKey });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No audio file provided or audio file is empty" }, { status: 400 });
    }

    console.log(`[VOICE_TRANSCRIBE] Ingesting audio blob: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
    const t0 = Date.now();

    // Ingest audio directly into Groq Whisper Large v3 Turbo
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      response_format: "json",
      language: "en",
      temperature: 0,
    });

    const durationMs = Date.now() - t0;
    const rawText = transcription.text?.trim() || "";

    // Clean leading/trailing punctuation and whitespace
    const clean = rawText.replace(/^[\s\.\,\!\?\-]+|[\s\.\,\!\?\-]+$/g, "").trim();

    // Filter out empty strings or non-speech bracket annotations like [music] or (cough)
    const isBlank = clean.length === 0 || /^\[.*\]$/.test(clean) || /^\(.*\)$/.test(clean);
    const text = isBlank ? "" : clean;

    console.log(`[VOICE_TRANSCRIBE] Whisper completed in ${durationMs}ms: "${text}"`);

    return NextResponse.json({
      text,
      durationMs,
    });
  } catch (error: any) {
    console.warn("[VOICE_TRANSCRIBE_ERROR]:", error?.message || error);
    return NextResponse.json({
      text: "",
      durationMs: 0,
      error: error?.message || "Audio processing failed",
    });
  }
}

