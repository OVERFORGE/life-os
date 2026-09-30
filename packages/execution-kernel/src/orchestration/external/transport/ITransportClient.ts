/**
 * ITransportClient.ts
 *
 * Wire transport interface for external capability communication.
 * Implementations wrap official @modelcontextprotocol/sdk or local IPC bridges.
 */

export type TransportHealthStatus = "HEALTHY" | "DEGRADED" | "OFFLINE";

export interface MCPToolCallRequest {
  toolName: string;
  arguments: Record<string, unknown>;
  timeoutMs?: number;
}

export interface MCPToolCallResponse {
  success: boolean;
  content: Array<{ type: string; text?: string; data?: unknown }>;
  isError?: boolean;
}

export interface ITransportClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  callTool(request: MCPToolCallRequest): Promise<MCPToolCallResponse>;
  ping(): Promise<boolean>;
  getHealthStatus(): TransportHealthStatus;
}
