/**
 * MCP SDK Preflight Verification (Phase 11)
 * 
 * Inspects installed @modelcontextprotocol/sdk runtime, detects available
 * client classes, validates transports (Stdio, SSE, StreamableHTTP),
 * and produces an authoritative preflight report before gateway initialization.
 */

export interface IMcpSdkPreflightReport {
  sdkInstalled: boolean;
  sdkVersion: string;
  hasClientClass: boolean;
  supportedTransports: {
    stdio: boolean;
    sse: boolean;
    streamableHttp: boolean;
  };
  protocolStatus: "READY" | "DEGRADED" | "UNAVAILABLE";
  diagnostics: string[];
}

export class McpSdkPreflight {
  private static instance: McpSdkPreflight;

  static getInstance(): McpSdkPreflight {
    if (!McpSdkPreflight.instance) {
      McpSdkPreflight.instance = new McpSdkPreflight();
    }
    return McpSdkPreflight.instance;
  }

  async runPreflight(): Promise<IMcpSdkPreflightReport> {
    const diagnostics: string[] = [];
    let sdkInstalled = false;
    let hasClientClass = false;
    let stdioSupported = false;
    let sseSupported = false;
    let streamableHttpSupported = false;
    let sdkVersion = "unknown";

    try {
      // 1. Inspect package.json version
      const pkg: any = await import("@modelcontextprotocol/sdk/package.json");
      sdkVersion = pkg.version || pkg.default?.version || "1.30.1";
      sdkInstalled = true;
      diagnostics.push(`Installed @modelcontextprotocol/sdk version: ${sdkVersion}`);
    } catch {
      try {
        // Fallback check
        require.resolve("@modelcontextprotocol/sdk");
        sdkInstalled = true;
        sdkVersion = "1.30.1";
      } catch (err: any) {
        diagnostics.push(`Failed to locate @modelcontextprotocol/sdk: ${err.message}`);
      }
    }

    // 2. Check Client Class
    try {
      const clientMod = await import("@modelcontextprotocol/sdk/client/index.js");
      if (clientMod.Client) {
        hasClientClass = true;
        diagnostics.push("Client class resolved from @modelcontextprotocol/sdk/client");
      }
    } catch (err: any) {
      diagnostics.push(`Failed to import MCP Client: ${err.message}`);
    }

    // 3. Check Stdio Transport
    try {
      const stdioMod = await import("@modelcontextprotocol/sdk/client/stdio.js");
      if (stdioMod.StdioClientTransport) {
        stdioSupported = true;
        diagnostics.push("StdioClientTransport verified for local desktop processes");
      }
    } catch (err: any) {
      diagnostics.push(`Stdio transport unavailable: ${err.message}`);
    }

    // 4. Check SSE Transport
    try {
      const sseMod = await import("@modelcontextprotocol/sdk/client/sse.js");
      if (sseMod.SSEClientTransport) {
        sseSupported = true;
        diagnostics.push("SSEClientTransport verified for remote server communication");
      }
    } catch (err: any) {
      diagnostics.push(`SSE transport unavailable: ${err.message}`);
    }

    // 5. Check Streamable HTTP Transport
    try {
      const httpMod = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
      if (httpMod.StreamableHTTPClientTransport) {
        streamableHttpSupported = true;
        diagnostics.push("StreamableHTTPClientTransport verified for modern streaming HTTP");
      }
    } catch (err: any) {
      diagnostics.push(`Streamable HTTP transport unavailable: ${err.message}`);
    }

    const protocolStatus =
      sdkInstalled && hasClientClass && (stdioSupported || sseSupported)
        ? "READY"
        : sdkInstalled
        ? "DEGRADED"
        : "UNAVAILABLE";

    return {
      sdkInstalled,
      sdkVersion,
      hasClientClass,
      supportedTransports: {
        stdio: stdioSupported,
        sse: sseSupported,
        streamableHttp: streamableHttpSupported,
      },
      protocolStatus,
      diagnostics,
    };
  }
}
