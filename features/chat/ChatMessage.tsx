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
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} md:px-48`}>
      <div className={`flex flex-col group max-w-[720px] w-full ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`
          px-6
          py-5
          rounded-3xl
          text-[15px]
          leading-relaxed
          whitespace-pre-wrap
          break-words
          w-auto
          ${
            isUser
              ? "bg-[#232632] text-gray-100 rounded-tr-sm"
              : "text-gray-300"
          }
          `}
        >
          <ReactMarkdown
            components={{
              ul: ({ children }) => (
                <ul className="list-disc ml-5 space-y-2 mt-3 mb-3">
                  {children}
                </ul>
              ),
              p: ({ children }) => (
                <p className="mb-3 last:mb-0">{children}</p>
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
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors text-xs font-medium"
          >
             {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
             {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}