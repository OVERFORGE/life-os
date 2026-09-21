"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export type VoiceStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

export interface VoiceOption {
  id: string;
  name: string;
  gender: "female" | "male";
  accent: string;
}

export const AVAILABLE_VOICES: VoiceOption[] = [
  { id: "en-GB-RyanNeural", name: "LifeOS Voice", gender: "male", accent: "Polished British (Jarvis)" },
];

/**
 * Normalizes text for speech: expands abbreviations, removes markdown/syntax symbols,
 * and formats parentheses as natural spoken clauses so Edge TTS never truncates.
 */
function cleanTextForSpeech(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<planning>[\s\S]*?<\/planning>/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\be\.g\.,?\s*/gi, "for example, ")
    .replace(/\bi\.e\.,?\s*/gi, "that is, ")
    .replace(/\betc\.\s*/gi, "and so on. ")
    .replace(/\bvs\.\s*/gi, "versus ")
    // Strip markdown table rows and pipes cleanly
    .replace(/\|[\s\-:|]+\|/g, " ")
    .replace(/\|/g, ", ")
    .replace(/^[-=*]{3,}\s*$/gm, "")
    .replace(/^[\s*\-•]+\s*/gm, "")
    .replace(/[*#_~>]/g, "")
    .replace(/["""]/g, "")
    .replace(/\(([^)]+)\)/g, ", $1, ")
    .replace(/,\s*,+/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts complete spoken chunks (sentences, bullet items, recipe steps) from a streaming buffer.
 * Supports standard punctuation (. ! ?) as well as newline-separated bullets and instructions.
 */
function extractNextSpokenSentences(rawBuffer: string): { sentences: string[]; remainder: string } {
  const normalized = rawBuffer
    .replace(/\be\.g\.,?\s*/gi, "for example, ")
    .replace(/\bi\.e\.,?\s*/gi, "that is, ")
    .replace(/\betc\.\s*/gi, "and so on. ")
    .replace(/\bvs\.\s*/gi, "versus ");

  // Matches either:
  // 1. A sentence ending in . ! ? followed by whitespace or end of string
  // 2. A distinct line / bullet item ending in \n (at least 8 chars)
  const sentenceRegex = /([^.!?\n]{3,}[.!?]+(?:\s+|$)|[^\n]{8,}\n+)/g;
  const sentences: string[] = [];
  let match;
  let lastIdx = 0;

  while ((match = sentenceRegex.exec(normalized)) !== null) {
    const s = match[1].trim();
    if (s.length > 0) {
      sentences.push(s);
    }
    lastIdx = sentenceRegex.lastIndex;
  }

  let remainder = lastIdx > 0 ? normalized.slice(lastIdx) : normalized;

  // Safety break: if remainder exceeds 160 characters without a line or sentence break,
  // split at the nearest comma or space so voice synthesis never pauses awkwardly.
  if (remainder.length > 160) {
    const splitIdx = Math.max(remainder.lastIndexOf(",", 160), remainder.lastIndexOf(" ", 160));
    if (splitIdx > 20) {
      const chunk = remainder.slice(0, splitIdx).trim();
      if (chunk.length > 0) {
        sentences.push(chunk + ".");
      }
      remainder = remainder.slice(splitIdx + 1);
    }
  }

  return { sentences, remainder };
}

/**
 * Detects the best natively supported audio recording mime-type in the browser
 */
function getBestRecordingMimeType(): string {
  if (typeof window === "undefined" || !window.MediaRecorder) return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

interface UseRealtimeVoiceProps {
  conversationId?: string | null;
  onTurnComplete?: (userMsg: string, assistantReply: string) => void;
}

export function useRealtimeVoice({
  conversationId,
  onTurnComplete,
}: UseRealtimeVoiceProps = {}) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [hasDetectedUserSpeech, setHasDetectedUserSpeech] = useState<boolean>(false);
  const [selectedVoice, setSelectedVoice] = useState<string>("en-GB-RyanNeural");
  const [userTranscript, setUserTranscript] = useState<string>("");
  const [assistantTranscript, setAssistantTranscript] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stable prop & state mirrors
  const isMutedRef = useRef<boolean>(false);
  const selectedVoiceRef = useRef<string>("en-GB-RyanNeural");
  const conversationIdRef = useRef<string | null | undefined>(conversationId);
  const onTurnCompleteRef = useRef<typeof onTurnComplete>(onTurnComplete);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    onTurnCompleteRef.current = onTurnComplete;
  }, [onTurnComplete]);

  // Hardware Audio references
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Turn State Machine & Locks
  const activeStatusRef = useRef<VoiceStatus>("idle");
  const isProcessingTurnRef = useRef<boolean>(false);
  const turnStartTimeRef = useRef<number>(0);

  // Voice Activity Detection (VAD) state
  const noiseFloorRef = useRef<number>(0.008);
  const speechDetectedRef = useRef<boolean>(false);
  const speechStartTimeRef = useRef<number | null>(null);
  const lastSpokenTimestampRef = useRef<number | null>(null);
  const consecutiveSpeechFramesRef = useRef<number>(0);

  // Playback & Strictly Ordered Sentence Playback Queue
  const reusableAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingQueueRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamEndedRef = useRef<boolean>(false);
  const inFlightTTSCountRef = useRef<number>(0);

  // Strictly Ordered Sentence Playback Slot Buffer
  const pendingTTSSlotsRef = useRef<Map<number, string>>(new Map());
  const nextPlayIndexRef = useRef<number>(0);
  const totalSentencesRef = useRef<number>(0);

  useEffect(() => {
    activeStatusRef.current = status;
  }, [status]);

  const handleBargeInRef = useRef<(text?: string) => void>(() => {});

  /**
   * Stop any playing audio, clear queue, and release object URLs
   */
  const stopAudioPlayback = useCallback(() => {
    if (reusableAudioRef.current) {
      try {
        reusableAudioRef.current.pause();
        reusableAudioRef.current.removeAttribute("src");
      } catch (_) {}
    }

    audioQueueRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    });

    pendingTTSSlotsRef.current.forEach((url) => {
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      }
    });

    audioQueueRef.current = [];
    pendingTTSSlotsRef.current.clear();
    nextPlayIndexRef.current = 0;
    totalSentencesRef.current = 0;
    isPlayingQueueRef.current = false;
  }, []);

  /**
   * Starts a fresh MediaRecorder instance for a new listening turn
   */
  const startRecordingTurn = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream || stream.getAudioTracks().length === 0) return;

    // Reset VAD state
    speechDetectedRef.current = false;
    speechStartTimeRef.current = null;
    lastSpokenTimestampRef.current = null;
    consecutiveSpeechFramesRef.current = 0;
    turnStartTimeRef.current = performance.now();
    isProcessingTurnRef.current = false;
    setHasDetectedUserSpeech(false);

    // Clean up old recorder if still active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }

    recordedChunksRef.current = [];

    try {
      const mimeType = getBestRecordingMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      // Emit timeslices every 100ms
      recorder.start(100);
      mediaRecorderRef.current = recorder;

      // Resume live speech recognition if paused
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.start();
        } catch (_) {}
      }

      activeStatusRef.current = "listening";
      setStatus("listening");
    } catch (err: any) {
      console.error("[VOICE] Error starting MediaRecorder:", err);
      setErrorMessage("Failed to start voice recorder: " + err.message);
      activeStatusRef.current = "error";
      setStatus("error");
    }
  }, []);

  /**
   * Cycles recorder during long silence to prevent huge audio buffers while preserving responsiveness
   */
  const cycleRecorderBuffer = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream || speechDetectedRef.current || isProcessingTurnRef.current) return;

    turnStartTimeRef.current = performance.now();
    const oldRecorder = mediaRecorderRef.current;
    if (oldRecorder && oldRecorder.state !== "inactive") {
      try {
        oldRecorder.ondataavailable = null;
        oldRecorder.onstop = null;
        oldRecorder.stop();
      } catch (_) {}
    }

    recordedChunksRef.current = [];

    try {
      const mimeType = getBestRecordingMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
    } catch (_) {}
  }, []);

  /**
   * Resets turn state and initiates fresh recording
   */
  const resetListeningTurn = useCallback(() => {
    isProcessingTurnRef.current = false;
    startRecordingTurn();
  }, [startRecordingTurn]);

  /**
   * Check if assistant has completed stream + all TTS fetches + all audio segments
   */
  const checkIfTurnFullyComplete = useCallback(() => {
    if (
      streamEndedRef.current &&
      inFlightTTSCountRef.current === 0 &&
      !isPlayingQueueRef.current &&
      audioQueueRef.current.length === 0 &&
      pendingTTSSlotsRef.current.size === 0
    ) {
      console.log("[VOICE] Assistant finished speaking. Returning to listening in 200ms...");
      setTimeout(() => {
        if (
          streamEndedRef.current &&
          inFlightTTSCountRef.current === 0 &&
          !isPlayingQueueRef.current &&
          audioQueueRef.current.length === 0 &&
          pendingTTSSlotsRef.current.size === 0
        ) {
          resetListeningTurn();
        }
      }, 200);
    }
  }, [resetListeningTurn]);

  /**
   * Play the next synthesized sentence audio chunk from the queue
   */
  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingQueueRef.current = false;
      checkIfTurnFullyComplete();
      return;
    }

    isPlayingQueueRef.current = true;
    activeStatusRef.current = "speaking";
    setStatus("speaking");

    // Ensure full-duplex microphone recording is active so user barge-in is captured with pre-roll
    const stream = mediaStreamRef.current;
    if (stream && (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive")) {
      try {
        const mimeType = getBestRecordingMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recordedChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };
        recorder.start(100);
        mediaRecorderRef.current = recorder;
      } catch (_) {}
    }

    // Ensure live speech recognition is active for real-time conversational barge-in
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.start();
      } catch (_) {}
    }

    const nextAudioUrl = audioQueueRef.current.shift()!;
    let audio = reusableAudioRef.current;
    if (!audio) {
      audio = new Audio();
      reusableAudioRef.current = audio;
    }

    audio.src = nextAudioUrl;

    audio.onended = () => {
      try {
        URL.revokeObjectURL(nextAudioUrl);
      } catch (_) {}
      playNextInQueue();
    };

    audio.onerror = (e) => {
      console.warn("[VOICE] Audio playback error for segment:", e);
      try {
        URL.revokeObjectURL(nextAudioUrl);
      } catch (_) {}
      playNextInQueue();
    };

    audio.play().catch((playErr) => {
      console.warn("[VOICE] Audio play() exception:", playErr);
      playNextInQueue();
    });
  }, [checkIfTurnFullyComplete]);

  /**
   * Drains sequential sentence slots into the playback queue in strict 0, 1, 2, ... order
   */
  const drainOrderedSlots = useCallback(() => {
    while (pendingTTSSlotsRef.current.has(nextPlayIndexRef.current)) {
      const url = pendingTTSSlotsRef.current.get(nextPlayIndexRef.current)!;
      pendingTTSSlotsRef.current.delete(nextPlayIndexRef.current);
      nextPlayIndexRef.current++;

      if (url && url.length > 0) {
        audioQueueRef.current.push(url);
      }
    }

    if (!isPlayingQueueRef.current && audioQueueRef.current.length > 0) {
      playNextInQueue();
    }
  }, [playNextInQueue]);

  /**
   * Pre-fetches a synthesized sentence audio blob from the TTS API with strict sequence indexing
   */
  const fetchAndQueueSentenceTTS = useCallback(
    async (sentence: string, index: number, voice: string, signal?: AbortSignal) => {
      const clean = cleanTextForSpeech(sentence);
      if (!clean) {
        pendingTTSSlotsRef.current.set(index, "");
        drainOrderedSlots();
        return;
      }

      inFlightTTSCountRef.current++;
      try {
        console.log(`[VOICE_TTS] Synthesizing [${index}]: "${clean}"`);
        const res = await fetch(
          `/api/voice/tts?text=${encodeURIComponent(clean)}&voice=${encodeURIComponent(voice)}`,
          { signal }
        );

        if (!res.ok) {
          console.warn("[VOICE_TTS] TTS fetch returned status:", res.status);
          pendingTTSSlotsRef.current.set(index, "");
          drainOrderedSlots();
          return;
        }

        const blob = await res.blob();
        if (signal?.aborted) return;

        const audioUrl = URL.createObjectURL(blob);
        pendingTTSSlotsRef.current.set(index, audioUrl);
        drainOrderedSlots();
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("[VOICE_TTS] Failed to synthesize chunk:", err);
        }
        pendingTTSSlotsRef.current.set(index, "");
        drainOrderedSlots();
      } finally {
        inFlightTTSCountRef.current = Math.max(0, inFlightTTSCountRef.current - 1);
        checkIfTurnFullyComplete();
      }
    },
    [drainOrderedSlots, checkIfTurnFullyComplete]
  );

  /**
   * Execute conversational turn through LifeOS Kernel and stream audio sentences
   */
  const processUserSpeech = useCallback(
    async (transcript: string) => {
      const cleanTranscript = transcript.trim();
      if (!cleanTranscript) {
        resetListeningTurn();
        return;
      }

      console.log(`[VOICE] Executing user turn: "${cleanTranscript}"`);
      activeStatusRef.current = "thinking";
      setStatus("thinking");
      setUserTranscript(cleanTranscript);
      setAssistantTranscript("");
      setErrorMessage(null);
      streamEndedRef.current = false;
      inFlightTTSCountRef.current = 0;

      // Reset sequential slot ordering state
      pendingTTSSlotsRef.current.clear();
      nextPlayIndexRef.current = 0;
      totalSentencesRef.current = 0;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const convId = conversationIdRef.current;
        const endpoint = convId
          ? `/api/conversations/${encodeURIComponent(convId)}/messages`
          : `/api/conversation`;

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: cleanTranscript,
            mode: "general",
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          let errorDetail = `Server error (${response.status})`;
          try {
            const errData = await response.json();
            if (errData?.error?.message || errData?.error) {
              errorDetail = errData.error.message || errData.error;
            }
          } catch (_) {}
          throw new Error(errorDetail);
        }

        if (!response.body) {
          throw new Error("No streaming body received from assistant");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullReply = "";
        let sentenceBuffer = "";
        const currentVoice = selectedVoiceRef.current;
        let sentenceIndex = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkText = decoder.decode(value, { stream: true });
          fullReply += chunkText;
          sentenceBuffer += chunkText;
          setAssistantTranscript((prev) => prev + chunkText);

          // Extract completed spoken sentences cleanly
          const { sentences, remainder } = extractNextSpokenSentences(sentenceBuffer);
          for (const s of sentences) {
            const idx = sentenceIndex++;
            totalSentencesRef.current = sentenceIndex;
            fetchAndQueueSentenceTTS(s, idx, currentVoice, abortController.signal);
          }
          sentenceBuffer = remainder;
        }

        // Finalize any remaining text fragment safely in bite-sized spoken chunks
        if (sentenceBuffer.trim().length > 0) {
          const remainingChunks = sentenceBuffer.trim().match(/[^.!?\n]{1,160}(?:[.!?\n]+|$)|.{1,160}/g) || [sentenceBuffer.trim()];
          for (const chunk of remainingChunks) {
            const cleanChunk = chunk.trim();
            if (cleanChunk.length > 0) {
              const idx = sentenceIndex++;
              totalSentencesRef.current = sentenceIndex;
              fetchAndQueueSentenceTTS(cleanChunk, idx, currentVoice, abortController.signal);
            }
          }
        }

        streamEndedRef.current = true;
        onTurnCompleteRef.current?.(cleanTranscript, fullReply);
        checkIfTurnFullyComplete();
      } catch (err: any) {
        if (err.name === "AbortError") {
          console.log("[VOICE] Turn interrupted by user.");
        } else {
          console.error("[VOICE] Turn execution error:", err);
          setErrorMessage(err.message || "Failed to process turn");
          activeStatusRef.current = "error";
          setStatus("error");
          isProcessingTurnRef.current = false;
        }
      }
    },
    [fetchAndQueueSentenceTTS, checkIfTurnFullyComplete, resetListeningTurn]
  );

  /**
   * Natural full-duplex conversational barge-in:
   * When user speaks while assistant is talking, immediately silence assistant
   * and transition seamlessly to capturing the user's speech.
   */
  const handleBargeIn = useCallback((interimText?: string) => {
    // If not actively speaking or playing audio queue, update interim transcript if present and return
    if (activeStatusRef.current !== "speaking" && !isPlayingQueueRef.current) {
      if (interimText && interimText.trim().length > 0) {
        setUserTranscript(interimText.trim());
        lastSpokenTimestampRef.current = performance.now();
      }
      return;
    }

    console.log("[VOICE] Full-duplex barge-in detected! Silencing assistant immediately...");
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopAudioPlayback();
    streamEndedRef.current = true;
    inFlightTTSCountRef.current = 0;
    isProcessingTurnRef.current = false;

    // Ensure microphone recorder is running to capture user speech
    const stream = mediaStreamRef.current;
    if (stream && (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive")) {
      try {
        const mimeType = getBestRecordingMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recordedChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };
        recorder.start(100);
        mediaRecorderRef.current = recorder;
      } catch (_) {}
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.start();
      } catch (_) {}
    }

    activeStatusRef.current = "listening";
    setStatus("listening");
    speechDetectedRef.current = true;
    const now = performance.now();
    speechStartTimeRef.current = now;
    lastSpokenTimestampRef.current = now;
    consecutiveSpeechFramesRef.current = 0;
    setHasDetectedUserSpeech(true);

    if (interimText && interimText.trim().length > 0) {
      setUserTranscript(interimText.trim());
    } else {
      setUserTranscript("");
    }
  }, [stopAudioPlayback]);

  useEffect(() => {
    handleBargeInRef.current = handleBargeIn;
  }, [handleBargeIn]);

  /**
   * Immediately interrupts the assistant when user speaks or taps interrupt
   */
  const interruptAssistant = useCallback(() => {
    console.log("[VOICE] Interrupted assistant.");
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopAudioPlayback();
    streamEndedRef.current = true;
    inFlightTTSCountRef.current = 0;
    isProcessingTurnRef.current = false;
    resetListeningTurn();
  }, [stopAudioPlayback, resetListeningTurn]);

  /**
   * Finalizes speaking turn: stops MediaRecorder, packages recorded audio Blob, and sends to Whisper Turbo
   * @param isManual True if user clicked orb or "Send" button
   */
  const finishSpeakingAndSend = useCallback(
    async (isManual: boolean = false) => {
      // If error, click recovers session
      if (activeStatusRef.current === "error") {
        setErrorMessage(null);
        resetListeningTurn();
        return;
      }

      // If assistant is speaking, manual click acts as an instant interrupt
      if (activeStatusRef.current === "speaking" || isPlayingQueueRef.current) {
        if (isManual) {
          interruptAssistant();
        }
        return;
      }

      // If already processing or not listening, ignore
      if (activeStatusRef.current !== "listening" || isProcessingTurnRef.current) {
        return;
      }

      // If automated trigger but no speech was ever detected, ignore
      if (!isManual && !speechDetectedRef.current) {
        return;
      }

      // Synchronously acquire mutex lock
      isProcessingTurnRef.current = true;
      activeStatusRef.current = "transcribing";
      setStatus("transcribing");

      // Pause live speech recognition during transcription
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (_) {}
      }

      console.log(`[VOICE] Finalizing turn (manual: ${isManual})...`);

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        // Await onstop to guarantee all timesliced chunks have flushed
        await new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
          try {
            recorder.stop();
          } catch (_) {
            resolve();
          }
        });
      }

      const mimeType = recorder?.mimeType || getBestRecordingMimeType() || "audio/webm";
      const audioBlob = new Blob(recordedChunksRef.current, { type: mimeType });
      recordedChunksRef.current = [];

      console.log(`[VOICE] Audio blob created: ${audioBlob.size} bytes (${mimeType})`);

      // Guard against zero/near-zero audio (e.g. empty mic or accidental tap)
      if (audioBlob.size < 1500) {
        console.log("[VOICE] Audio blob too small (<1.5KB), resuming listening.");
        resetListeningTurn();
        return;
      }

      try {
        const formData = new FormData();
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        formData.append("file", audioBlob, `user_speech.${ext}`);

        const res = await fetch("/api/voice/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          let errorMsg = `Transcription failed (${res.status})`;
          try {
            const errData = await res.json();
            if (errData?.error) errorMsg = errData.error;
          } catch (_) {}
          throw new Error(errorMsg);
        }

        const data = await res.json();
        const rawTranscript = (data.text || "").trim();
        console.log(`[VOICE] Whisper transcribed in ${data.durationMs}ms: "${rawTranscript}"`);

        if (rawTranscript.length > 0) {
          await processUserSpeech(rawTranscript);
        } else {
          console.log("[VOICE] Empty transcript received. Resuming listening.");
          resetListeningTurn();
        }
      } catch (transcribeErr: any) {
        console.error("[VOICE] Transcription failed:", transcribeErr);
        setErrorMessage(transcribeErr.message || "Failed to transcribe speech.");
        activeStatusRef.current = "error";
        setStatus("error");
        isProcessingTurnRef.current = false;
      }
    },
    [interruptAssistant, resetListeningTurn, processUserSpeech]
  );

  /**
   * Continuous UI animation & real-time Voice Activity Detection (VAD) loop
   */
  const startVADLoop = useCallback(() => {
    const loop = () => {
      const analyser = analyserRef.current;
      const currentStatus = activeStatusRef.current;

      if (analyser) {
        const timeDomainData = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(timeDomainData);

        // Calculate root-mean-square (RMS) energy
        let sumSquares = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          sumSquares += timeDomainData[i] * timeDomainData[i];
        }
        const rms = Math.sqrt(sumSquares / timeDomainData.length);

        // Visual energy level for fluid orb & soundwaves
        if (currentStatus === "speaking" || currentStatus === "thinking") {
          setAudioLevel((prev) => Math.max(0.08, prev * 0.95));
        } else {
          const energy = Math.max(0, rms - noiseFloorRef.current);
          const visualLevel = Math.min(1, energy * 30);
          setAudioLevel(visualLevel);
        }

        // 1. Full-duplex conversational barge-in VAD while assistant is speaking
        if (currentStatus === "speaking" && !isMutedRef.current) {
          const now = performance.now();
          const bargeInThreshold = Math.max(0.045, noiseFloorRef.current * 3.5 + 0.02);
          if (rms > bargeInThreshold) {
            consecutiveSpeechFramesRef.current++;
            // Require 4 consecutive frames (~65ms) of sustained human speech to trigger barge-in
            if (consecutiveSpeechFramesRef.current >= 4) {
              consecutiveSpeechFramesRef.current = 0;
              console.log(`[VAD] Barge-in energy detected (RMS: ${rms.toFixed(4)} > ${bargeInThreshold.toFixed(4)})`);
              handleBargeIn();
            }
          } else {
            consecutiveSpeechFramesRef.current = 0;
            if (!speechDetectedRef.current && now - turnStartTimeRef.current > 4000) {
              cycleRecorderBuffer();
            }
          }
        }

        // 2. VAD Logic when actively listening
        if (currentStatus === "listening" && !isProcessingTurnRef.current && !isMutedRef.current) {
          const now = performance.now();

          // Adapt noise floor on quiet frames
          if (!speechDetectedRef.current) {
            if (rms < noiseFloorRef.current) {
              noiseFloorRef.current = noiseFloorRef.current * 0.92 + rms * 0.08;
            } else if (rms < noiseFloorRef.current * 1.5) {
              noiseFloorRef.current = noiseFloorRef.current * 0.98 + rms * 0.02;
            }
            noiseFloorRef.current = Math.max(0.005, Math.min(0.03, noiseFloorRef.current));
          }

          // Dynamic conversational thresholds
          const onsetThreshold = Math.max(0.016, noiseFloorRef.current * 2.0 + 0.006);
          const holdThreshold = Math.max(0.009, noiseFloorRef.current * 1.35 + 0.002);

          if (!speechDetectedRef.current) {
            // Awaiting speech onset
            if (rms > onsetThreshold) {
              consecutiveSpeechFramesRef.current++;
              // Require ~50ms of sustained speech
              if (consecutiveSpeechFramesRef.current >= 3) {
                speechDetectedRef.current = true;
                speechStartTimeRef.current = now;
                lastSpokenTimestampRef.current = now;
                setHasDetectedUserSpeech(true);
                console.log(`[VAD] Speech onset detected! RMS: ${rms.toFixed(4)}`);
              }
            } else {
              consecutiveSpeechFramesRef.current = 0;
              // Periodically cycle recorder if idle for > 6 seconds to keep pre-roll fresh
              if (now - turnStartTimeRef.current > 6000) {
                cycleRecorderBuffer();
              }
            }
          } else {
            // Actively speaking or in natural pause
            if (rms >= holdThreshold) {
              lastSpokenTimestampRef.current = now;
            }

            const silenceMs = now - (lastSpokenTimestampRef.current || now);
            const vocalDurationMs = (lastSpokenTimestampRef.current || now) - (speechStartTimeRef.current || now);
            const totalTurnMs = now - (speechStartTimeRef.current || now);

            // Natural conversational pause:
            // Allow breathing / thinking pauses so user is NEVER cut off mid-thought.
            // Short utterances (< 1.5s vocal duration) require 1200ms silence.
            // Longer utterances require 1050ms silence.
            const requiredSilenceMs = vocalDurationMs < 1500 ? 1200 : 1050;

            if (silenceMs >= requiredSilenceMs) {
              if (vocalDurationMs >= 300) {
                console.log(`[VAD] Natural pause reached (${silenceMs.toFixed(0)}ms >= ${requiredSilenceMs}ms). Submitting turn...`);
                finishSpeakingAndSend(false);
              } else {
                // Short noise blip, discard and resume listening
                speechDetectedRef.current = false;
                setHasDetectedUserSpeech(false);
                speechStartTimeRef.current = null;
                lastSpokenTimestampRef.current = null;
                consecutiveSpeechFramesRef.current = 0;
              }
            } else if (totalTurnMs > 25000) {
              // Safety ceiling
              console.log("[VAD] Maximum turn limit reached. Submitting turn...");
              finishSpeakingAndSend(false);
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
  }, [cycleRecorderBuffer, finishSpeakingAndSend, handleBargeIn]);

  /**
   * Start the real-time voice session
   */
  const startSession = useCallback(async () => {
    try {
      setErrorMessage(null);
      setUserTranscript("");
      setAssistantTranscript("");
      setHasDetectedUserSpeech(false);
      isProcessingTurnRef.current = false;
      noiseFloorRef.current = 0.008;
      speechDetectedRef.current = false;
      speechStartTimeRef.current = null;
      lastSpokenTimestampRef.current = null;
      consecutiveSpeechFramesRef.current = 0;
      recordedChunksRef.current = [];

      // 1. Prime persistent audio element for autoplay permissions
      if (!reusableAudioRef.current) {
        const audio = new Audio();
        audio.src =
          "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        audio.play().catch(() => {});
        reusableAudioRef.current = audio;
      }

      // 2. Request microphone with hardware acoustic processing
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;

      // 3. Setup AudioContext and AnalyserNode purely for visualization and VAD
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      // 4. Initialize Web Speech API for real-time live transcription display as you speak
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const recognition = new SpeechRec();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = "en-US";

          recognition.onresult = (event: any) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              interim += event.results[i][0].transcript;
            }
            const trimmed = interim.trim();
            if (!trimmed) return;

            // If assistant is speaking or playing audio, user speech triggers immediate full-duplex barge-in!
            if (activeStatusRef.current === "speaking" || isPlayingQueueRef.current) {
              console.log("[VOICE] SpeechRecognition barge-in triggered by user speech:", trimmed);
              handleBargeInRef.current(trimmed);
              return;
            }

            if (activeStatusRef.current === "listening") {
              setUserTranscript(trimmed);
              setHasDetectedUserSpeech(true);
              speechDetectedRef.current = true;
              const now = performance.now();
              if (!speechStartTimeRef.current) speechStartTimeRef.current = now;
              lastSpokenTimestampRef.current = now;
            }
          };

          recognition.onerror = (e: any) => {
            console.warn("[VOICE_INTERIM] SpeechRecognition note:", e.error);
          };

          recognition.onend = () => {
            if (
              (activeStatusRef.current === "listening" || activeStatusRef.current === "speaking") &&
              mediaStreamRef.current
            ) {
              try {
                recognition.start();
              } catch (_) {}
            }
          };

          try {
            recognition.start();
            speechRecognitionRef.current = recognition;
          } catch (_) {}
        } catch (recErr) {
          console.warn("[VOICE] SpeechRecognition init error:", recErr);
        }
      }

      // 5. Start native MediaRecorder turn & VAD loop
      startRecordingTurn();
      startVADLoop();
    } catch (err: any) {
      console.error("[VOICE] Microphone initialization error:", err);
      setErrorMessage(
        err.name === "NotAllowedError"
          ? "Microphone access was denied. Please allow microphone permissions in your browser address bar."
          : `Failed to initialize microphone: ${err.message}`
      );
      activeStatusRef.current = "error";
      setStatus("error");
    }
  }, [startRecordingTurn, startVADLoop]);

  /**
   * End the real-time voice session and clean up all hardware resources
   */
  const endSession = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.stop();
      } catch (_) {}
      speechRecognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch (_) {}
      mediaRecorderRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch (_) {}
      analyserRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (_) {}
      audioContextRef.current = null;
    }

    stopAudioPlayback();
    isProcessingTurnRef.current = false;
    activeStatusRef.current = "idle";
    setStatus("idle");
    setAudioLevel(0);
    setHasDetectedUserSpeech(false);
    recordedChunksRef.current = [];
  }, [stopAudioPlayback]);

  /**
   * Toggle mute
   */
  const toggleMute = useCallback(() => {
    if (mediaStreamRef.current) {
      const audioTracks = mediaStreamRef.current.getAudioTracks();
      const willMute = !isMuted;
      audioTracks.forEach((track) => {
        track.enabled = !willMute;
      });
      setIsMuted(willMute);
    }
  }, [isMuted]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      endSession();
    };
  }, [endSession]);

  return {
    status,
    audioLevel,
    isMuted,
    hasDetectedUserSpeech,
    selectedVoice,
    setSelectedVoice,
    userTranscript,
    assistantTranscript,
    errorMessage,
    startSession,
    endSession,
    toggleMute,
    interruptAssistant,
    finishSpeakingAndSend: () => finishSpeakingAndSend(true),
  };
}
