import { useKernelContext } from "@/providers/KernelProvider";
import { KernelClient } from "@/lib/kernelClient";

export function useConversation() {
  const { modules, metadata, refreshModule } = useKernelContext();
  const conversation = modules.conversation;

  const sendMessage = async (message: string, model?: string, mode?: string) => {
    const res = await KernelClient.sendMessage({ message, model, mode });
    await refreshModule("conversation");
    return res;
  };

  return {
    conversation,
    messages: conversation?.recentMessages || [],
    activeEntity: conversation?.activeEntity,
    isLoading: metadata.loading.conversation,
    error: metadata.errors.conversation,
    lastUpdated: metadata.timestamps.conversation,
    sendMessage,
    refresh: () => refreshModule("conversation"),
  };
}
