import ChatContainer from "@/features/chat/ChatContainer";

export default function AssistantPage() {
  return (
    <div className="h-[calc(100vh-80px)] w-full flex flex-col bg-[#161618]">
      <ChatContainer />
    </div>
  );
}