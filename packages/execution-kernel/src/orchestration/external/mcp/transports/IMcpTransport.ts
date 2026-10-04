/**
 * Pluggable MCP Transport Interface (Phase 11)
 * 
 * Formal transport abstraction for Model Context Protocol communication.
 */

export type McpTransportType = "STDIO" | "SSE" | "STREAMABLE_HTTP" | "MOCK";

export interface IMcpTransport {
  getTransportType(): McpTransportType;
  connect(): Promise<void>;
  send(payload: Record<string, any>): Promise<Record<string, any>>;
  close(): Promise<void>;
  healthCheck(): Promise<boolean>;
  isConnected(): boolean;
}
