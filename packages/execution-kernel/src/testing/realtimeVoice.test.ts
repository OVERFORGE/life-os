import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/**
 * Text sanitization for speech
 */
function sanitizeForSpeech(rawText: string): string {
  if (!rawText) return "";

  let text = rawText;
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<planning>[\s\S]*?<\/planning>/gi, "");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/_([^_]+)_/g, "$1");
  text = text.replace(/^[#>-]+\s+/gm, "");
  text = text.replace(/^\s*\*\s+/gm, "");
  text = text.replace(/^\s*\d+\.\s+/gm, "");
  text = text.replace(/^[-=*]{3,}\s*$/gm, "");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

/**
 * Sentence boundary extractor
 */
function extractSentences(buffer: string): { sentences: string[]; remainder: string } {
  const sentenceRegex = /([^\.!\?\n]+[\.!\?]+)(\s+|$)/g;
  const sentences: string[] = [];
  let match;
  let lastIdx = 0;

  while ((match = sentenceRegex.exec(buffer)) !== null) {
    const s = match[1].trim();
    if (s.length > 0) {
      sentences.push(s);
    }
    lastIdx = sentenceRegex.lastIndex;
  }

  return {
    sentences,
    remainder: buffer.slice(lastIdx),
  };
}

describe("Realtime Conversational Voice Architecture & Streaming", () => {
  it("TC-VOICE-01: Text sanitization removes markdown, code, and thinking tags", () => {
    const raw = `
<think>The user wants to plan tasks.</think>
# Daily Focus
Here is your plan:
* **Deep Work**: 2 hours on \`execution-kernel\`
* Review [documentation](https://lifeos.internal)

\`\`\`ts
const x = 42;
\`\`\`
Let's get started!
    `;

    const clean = sanitizeForSpeech(raw);

    assert.ok(!clean.includes("<think>"), "Thinking tags must be removed");
    assert.ok(!clean.includes("```"), "Code blocks must be removed");
    assert.ok(!clean.includes("**"), "Bold asterisks must be removed");
    assert.ok(!clean.includes("#"), "Markdown headers must be removed");
    assert.ok(!clean.includes("https://"), "Raw URLs in markdown links must be removed");
    assert.ok(clean.includes("Deep Work: 2 hours on execution-kernel"), "Content within formatting preserved");
    assert.ok(clean.includes("documentation"), "Link text preserved");
    assert.ok(clean.includes("Let's get started!"), "End sentence preserved");
  });

  it("TC-VOICE-02: Sentence boundary streaming extracts complete conversational sentences", () => {
    const streamChunk1 = "Good morning! I have reviewed your day. You have three";
    const extraction1 = extractSentences(streamChunk1);

    assert.equal(extraction1.sentences.length, 2);
    assert.equal(extraction1.sentences[0], "Good morning!");
    assert.equal(extraction1.sentences[1], "I have reviewed your day.");
    assert.equal(extraction1.remainder, "You have three");

    const streamChunk2 = extraction1.remainder + " priority goals scheduled. Let's crush them!";
    const extraction2 = extractSentences(streamChunk2);

    assert.equal(extraction2.sentences.length, 2);
    assert.equal(extraction2.sentences[0], "You have three priority goals scheduled.");
    assert.equal(extraction2.sentences[1], "Let's crush them!");
    assert.equal(extraction2.remainder, "");
  });

  it("TC-VOICE-03: Zero-Cost Neural TTS streams valid MP3 audio chunks via MsEdgeTTS", async () => {
    const tts = new MsEdgeTTS();
    await tts.setMetadata("en-US-JennyNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const testPhrase = "LifeOS real-time conversational voice assistant is online.";
    const { audioStream } = tts.toStream(testPhrase);

    let totalBytes = 0;
    let chunkCount = 0;

    await new Promise<void>((resolve, reject) => {
      audioStream.on("data", (chunk: Buffer) => {
        chunkCount++;
        totalBytes += chunk.length;
      });

      audioStream.on("end", () => {
        try {
          tts.close();
        } catch (_) {}
        resolve();
      });

      audioStream.on("error", (err) => {
        try {
          tts.close();
        } catch (_) {}
        reject(err);
      });
    });

    assert.ok(chunkCount > 0, "Audio stream must yield at least one chunk");
    assert.ok(totalBytes > 1000, `Audio stream must yield valid MP3 audio data (got ${totalBytes} bytes)`);
  });

  it("TC-VOICE-04: Multiple voice options synthesize cleanly without errors", async () => {
    const voices = ["en-US-GuyNeural", "en-US-AriaNeural"];
    for (const v of voices) {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(v, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream("Voice validation check.");

      let bytes = 0;
      await new Promise<void>((resolve, reject) => {
        audioStream.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
        });
        audioStream.on("end", () => {
          try {
            tts.close();
          } catch (_) {}
          resolve();
        });
        audioStream.on("error", (err) => {
          try {
            tts.close();
          } catch (_) {}
          reject(err);
        });
      });

      assert.ok(bytes > 500, `Voice ${v} generated ${bytes} audio bytes`);
    }
  });
});
