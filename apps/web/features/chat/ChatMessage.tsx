import ReactMarkdown from "react-markdown";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

type Props = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatMessage({ role, content }: Props) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  // Clean up <think> tags from model reasoning
  const displayContent = content.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();

  const handleCopy = () => {
    if (!displayContent) return;
    navigator.clipboard.writeText(displayContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

        {/* Copy Button */}
        <div className={`mt-2 ${isUser ? 'mr-2' : 'ml-2'} opacity-0 group-hover:opacity-100 transition-opacity duration-200`}>
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