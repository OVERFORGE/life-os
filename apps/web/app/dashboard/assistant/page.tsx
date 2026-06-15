import ChatContainer from "@/features/chat/ChatContainer";

export default function AssistantPage() {
  return (
    <div className="h-[calc(100vh)] p-6 bg-[#0b0d12] ">
      <div
        className="
        h-full
        w-full
        mx-auto
        bg-[#0b0d12]
        
        rounded-2xl
        overflow-hidden
        "
      >
        <ChatContainer />
      </div>
    </div>
  );
}