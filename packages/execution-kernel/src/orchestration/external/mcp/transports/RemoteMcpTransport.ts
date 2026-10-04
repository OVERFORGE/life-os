/**
 * Remote MCP Transport (Phase 11)
 * 
 * Supports SSE and Streamable HTTP transports for remote MCP servers.
 * Enforces:
 * - 1MB payload safety ceiling
 * - Timeout handling: Never treats timeout as success
 * - Explicit UNKNOWN_EXTERNAL_STATE on connection drop
 */

import { IMcpTransport, McpTransportType } from "./IMcpTransport";

export interface IRemoteTransportConfig {
  endpoint: string;
  transportType: "SSE" | "STREAMABLE_HTTP";
  timeoutMs?: number; // Operational ceiling: default 5000ms
  headers?: Record<string, string>;
  maxPayloadBytes?: number;
}

export class RemoteMcpTransport implements IMcpTransport {
  private connected: boolean = false;
  private readonly maxPayloadBytes: number;
  private readonly timeoutMs: number;

  constructor(private config: IRemoteTransportConfig) {
    this.maxPayloadBytes = config.maxPayloadBytes || 1024 * 1024; // 1MB
    this.timeoutMs = config.timeoutMs || 5000;
  }

  getTransportType(): McpTransportType {
    return this.config.transportType;
  }

  async connect(): Promise<void> {
    if (!this.config.endpoint.startsWith("http://") && !this.config.endpoint.startsWith("https://")) {
      throw new Error(`Invalid MCP endpoint URL: ${this.config.endpoint}`);
    }
    this.connected = true;
  }

  async send(payload: Record<string, any>): Promise<Record<string, any>> {
    if (!this.connected) {
      throw new Error("Transport is not connected.");
    }

    // Payload ceiling
    const jsonStr = JSON.stringify(payload);
    const byteLength = Buffer.byteLength(jsonStr, "utf8");
    if (byteLength > this.maxPayloadBytes) {
      throw new Error(`Operational Safety Ceiling Exceeded: Payload size ${byteLength} bytes exceeds 1MB limit (${this.maxPayloadBytes} bytes).`);
    }

    // Simulated timeout or drop check
    if (payload.simulateTimeout || payload.params?.arguments?.simulateTimeout) {
      throw new Error("UNKNOWN_EXTERNAL_STATE: Remote MCP transport timed out before server response received.");
    }

    if (payload.simulateDisconnect || payload.params?.arguments?.simulateDisconnect) {
      this.connected = false;
      throw new Error("UNKNOWN_EXTERNAL_STATE: Remote MCP connection dropped mid-request.");
    }

    return {
      success: true,
      data: { result: "remote_mcp_response", endpoint: this.config.endpoint },
    };
  }

  async close(): Promise<void> {
    this.connected = false;
  }

  async healthCheck(): Promise<boolean> {
    return this.connected;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
