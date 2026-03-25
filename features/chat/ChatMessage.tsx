import ReactMarkdown from "react-markdown";

type Props = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatMessage({ role, content }: Props) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} md:px-48`}>
      <div
        className={`
        max-w-[720px]
        px-6
        py-5
        rounded-2xl
        text-[15px]
        leading-relaxed
        whitespace-pre-wrap
        break-words
        ${
          isUser
            ? "bg-gray-700 text-gray-200"
            : "text-gray-400"
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
              <p className="mb-3">{children}</p>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}