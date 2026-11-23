import ChatContainer from "@/features/chat/ChatContainer";

export const metadata = {
  title: "Aven — LifeOS Studio",
  description: "Executive temporal intelligence & copilot workspace",
};

export default function AvenPage() {
  return (
    <div className="h-full w-full flex flex-col bg-[#111113] overflow-hidden">
      <ChatContainer />
    </div>
  );
}
