import { useKernelContext } from "@/providers/KernelProvider";

export function useKernelState() {
  return useKernelContext();
}
