import { QueryClient } from "@tanstack/react-query";

let clientInstance: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    // Server: always create a new query client for each request
    return createQueryClient();
  }
  // Browser: create once and reuse
  if (!clientInstance) {
    clientInstance = createQueryClient();
  }
  return clientInstance;
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // 30 seconds
        gcTime: 5 * 60_000, // 5 minutes
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

