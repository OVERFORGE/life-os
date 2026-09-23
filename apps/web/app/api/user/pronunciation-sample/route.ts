import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { User } from "@/server/db/models/User";
import Groq from "groq-sdk";

export const dynamic = "force-dynamic";

/**
 * POST /api/user/pronunciation-sample
 * Ingests audio voice sample of user speaking their name.
 * Uses Groq Whisper + LLM to extract accurate English phonetic respelling
 * so British neural voices pronounce any cultural name authentically.
 */
export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    let userId = (session?.user as any)?.id;

    await connectDB();

    if (!userId && process.env.NODE_ENV !== "production") {
      const firstUser = await User.findOne().lean();
      if (firstUser) {
        userId = (firstUser as any)._id.toString();
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const writtenName = (formData.get("name") as string) || user.name || "User";

    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    const groq = new Groq({ apiKey });

    // 1. Transcribe audio sample using Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
      response_format: "json",
      temperature: 0,
      prompt: `The user is speaking their name: ${writtenName}.`,
    });

    const transcribedAudioText = transcription.text?.trim() || writtenName;

    // 2. Use LLM to infer the exact English phonetic respelling for en-GB-RyanNeural
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content: `You are an expert computational linguist and phonetician.
The user has provided an audio sample of their name.
Your task is to generate the optimal English phonetic respelling so that Microsoft Edge Neural TTS with British voice 'en-GB-RyanNeural' pronounces the user's name with authentic cultural inflection and correct vowels/consonants.

Rules:
1. The written name is: "${writtenName}".
2. The acoustic transcription of their voice sample is: "${transcribedAudioText}".
3. Provide the phonetic spelling using natural English syllables (e.g. for Indian "Daksh" -> "Duksh"; for Gaelic "Siobhan" -> "Shi-vawn"; for Slavic "Krzysztof" -> "Kshee-shtoff").
4. Return ONLY valid JSON:
{
  "phoneticSpelling": "string",
  "explanation": "string"
}`,
        },
        {
          role: "user",
          content: `Generate the British neural phonetic respelling for the name "${writtenName}".`,
        },
      ],
      temperature: 0.1,
    });

    let phoneticSpelling = transcribedAudioText;
    try {
      const text = completion.choices[0]?.message?.content || "";
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
        if (parsed.phoneticSpelling) {
          phoneticSpelling = parsed.phoneticSpelling.trim();
        }
      }
    } catch (_) {}

    // 3. Save to user profile
    if (!user.preferences) {
      user.preferences = {} as any;
    }
    user.preferences.phoneticName = phoneticSpelling;
    user.preferences.pronunciationPreference = {
      mode: "voice_sample",
      phoneticSpelling,
    };
    await user.save();

    return NextResponse.json({
      success: true,
      writtenName,
      phoneticSpelling,
      previewText: `Hello, ${phoneticSpelling}.`,
    });
  } catch (err: any) {
    console.error("[PRONUNCIATION_SAMPLE_ERROR]:", err);
    return NextResponse.json({ error: err.message || "Failed to process pronunciation sample" }, { status: 500 });
  }
}
