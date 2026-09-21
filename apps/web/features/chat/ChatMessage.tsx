import ReactMarkdown from "react-markdown";
import { Copy, Check, Volume2, Square } from "lucide-react";
import { useState, useRef, useEffect } from "react";

type Props = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatMessage({ role, content }: Props) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Clean up <think> tags from model reasoning
  const displayContent = content.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current = null;
      }
    };
  }, []);

  const handleToggleAudio = () => {
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current = null;
      }
      setIsPlaying(false);
      return;
    }

    if (!displayContent) return;

    try {
      const audio = new Audio(`/api/voice/tts?text=${encodeURIComponent(displayContent)}&voice=en-GB-RyanNeural`);
      audioRef.current = audio;
      setIsPlaying(true);

      audio.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };

      audio.play().catch((err) => {
        console.warn("[CHAT_MESSAGE] Playback error:", err);
        setIsPlaying(false);
        audioRef.current = null;
      });
    } catch (err) {
      console.warn("[CHAT_MESSAGE] Audio error:", err);
      setIsPlaying(false);
    }
  };

  const handleCopy = () => {
    if (!displayContent) return;
    navigator.clipboard.writeText(displayContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isUser && !displayContent) {
    return (
      <div className="flex w-full justify-start py-3">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1F2023] border border-[#2A2B2F] text-gray-300 text-xs shadow-sm">
          <span className="w-2 h-2 rounded-full bg-[#E8414A] animate-pulse" />
          <span className="font-medium">Aven is thinking...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex flex-col group w-full ${isUser ? 'items-end max-w-[60%]' : 'items-start'}`}>
        <div
          className={`
          text-[15px]
          leading-relaxed
          whitespace-pre-wrap
          break-words
          w-full
          ${
            isUser
              ? "bg-[#1F2023] border border-[#2A2B2F] text-gray-100 rounded-2xl rounded-tr-sm px-5 py-4 shadow-sm"
              : "bg-transparent text-gray-200 py-2"
          }
          `}
        >
          <ReactMarkdown
            components={{
              ul: ({ children }) => (
                <ul className="list-disc ml-5 space-y-2 mt-3 mb-3 text-gray-200">
                  {children}
                </ul>
              ),
              p: ({ children }) => (
                <p className="mb-3 last:mb-0 text-gray-200">{children}</p>
              ),
            }}
          >
            {displayContent}
          </ReactMarkdown>
        </div>

        {/* Actions Row */}
        <div
          className={`mt-2 ${isUser ? 'mr-2' : 'ml-2'} flex items-center gap-2 ${
            isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          } transition-opacity duration-200`}
        >
          {!isUser && (
            <button
              onClick={handleToggleAudio}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isPlaying
                  ? 'text-[#E8414A] bg-[#E8414A]/15 border border-[#E8414A]/30 shadow-sm'
                  : 'text-[#9ca3af] hover:text-gray-300 hover:bg-white/5'
              }`}
              title={isPlaying ? "Stop listening" : "Listen to response"}
            >
              {isPlaying ? (
                <>
                  <Square size={12} className="fill-current text-[#E8414A] animate-pulse" />
                  <span className="text-[#E8414A] font-semibold">Stop</span>
                </>
              ) : (
                <>
                  <Volume2 size={14} />
                  <span>Listen</span>
                </>
              )}
            </button>
          )}

          <button 
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[#9ca3af] hover:text-gray-300 hover:bg-white/5 transition-colors text-xs font-medium"
          >
             {copied ? <Check size={14} className="text-[#E8414A]" /> : <Copy size={14} />}
             {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}