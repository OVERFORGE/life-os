"use client";

import ChatInput from "./ChatInput";
import ChatMessage from "./ChatMessage";
import { useChat } from "./useChat";

export default function ChatContainer() {
  const { messages, sendMessage, loading } = useChat();

  return (
    <div className="h-full flex flex-col  ">

      {/* Messages */}

      <div className="flex-1 overflow-y-auto p-6 space-y-4 ">
        {messages.map((m, i) => (
          <ChatMessage
            key={i}
            role={m.role}
            content={m.content}
          />
        ))}
      </div>

      {/* Input */}

      <ChatInput onSend={sendMessage} loading={loading} />
    </div>
  );
}