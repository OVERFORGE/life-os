import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

import { McpSdkPreflight } from "../../orchestration/external/mcp/McpSdkPreflight";
import { StdioMcpTransport } from "../../orchestration/external/mcp/transports/StdioMcpTransport";
import { RemoteMcpTransport } from "../../orchestration/external/mcp/transports/RemoteMcpTransport";
import { McpCapabilityGateway } from "../../orchestration/external/mcp/McpCapabilityGateway";
import { McpBenchmarkSuite } from "./McpBenchmarkSuite";
import { UserMcpServerModel } from "../../../../../apps/web/server/db/models/UserMcpServerModel";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

test("PHASE 11: Controlled MCP Evaluation & Pilot Suite", async (suite) => {
  const testUserId = "test-user-mcp-phase11-" + Date.now();

  suite.before(async () => {
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri && mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { dbName: "lifeos" });
    }
  });

  suite.after(async () => {
    if (mongoose.connection.readyState === 1) {
      await UserMcpServerModel.deleteMany({ userId: testUserId });
      await mongoose.disconnect();
    }
  });

  await suite.test("MCP-01: Official MCP SDK Preflight Verification", async () => {
    const preflight = McpSdkPreflight.getInstance();
    const report = await preflight.runPreflight();

    assert.equal(report.sdkInstalled, true, "MCP SDK must be installed");
    assert.equal(report.hasClientClass, true, "Client class must be present");
    assert.equal(report.supportedTransports.stdio, true, "StdioClientTransport must be supported");
    assert.equal(report.supportedTransports.sse, true, "SSEClientTransport must be supported");
    assert.equal(report.supportedTransports.streamableHttp, true, "StreamableHTTPClientTransport must be supported");
    assert.equal(report.protocolStatus, "READY");
    assert.ok(report.diagnostics.length >= 4);
  });

  await suite.test("MCP-02: Stdio Transport Security Sandboxing & Executable Allowlist", async () => {
    // Case A: Whitelisted executable (node)
    const validTransport = new StdioMcpTransport({ command: "node", maxPayloadBytes: 1024 * 1024 });
    await validTransport.connect();
    assert.equal(validTransport.isConnected(), true);

    // Case B: Non-whitelisted dangerous command (rmdir / format)
    const dangerousTransport = new StdioMcpTransport({ command: "rmdir.exe" });
    await assert.rejects(
      async () => await dangerousTransport.connect(),
      /Security Violation/
    );

    // Case C: 1MB Payload Ceiling Rejection
    const massivePayload = { data: "a".repeat(1.2 * 1024 * 1024) };
    await assert.rejects(
      async () => await validTransport.send(massivePayload),
      /Operational Safety Ceiling Exceeded/
    );
  });

  await suite.test("MCP-03: Remote Transport & Timeout Safety (UNKNOWN_EXTERNAL_STATE)", async () => {
    const remoteTransport = new RemoteMcpTransport({
      endpoint: "https://mcp.internal.lifeos.net",
      transportType: "STREAMABLE_HTTP",
      timeoutMs: 3000,
    });

    await remoteTransport.connect();
    assert.equal(remoteTransport.isConnected(), true);

    // Invariant 9 & 10: Timeout must throw UNKNOWN_EXTERNAL_STATE, never pretend success!
    await assert.rejects(
      async () => await remoteTransport.send({ simulateTimeout: true }),
      /UNKNOWN_EXTERNAL_STATE/
    );
  });

  await suite.test("MCP-04: McpCapabilityGateway Tool Discovery & Sandboxed Execution", async () => {
    const gateway = McpCapabilityGateway.getInstance();
    gateway.clearServers(testUserId);

    const transport = new StdioMcpTransport({ command: "node" });
    const registration = await gateway.registerServer(
      testUserId,
      "local-desktop-tools",
      "Desktop Tool Suite",
      transport
    );

    assert.equal(registration.serverId, "local-desktop-tools");
    assert.ok(registration.discoveredTools.length >= 1);

    const tools = gateway.listDiscoveredTools(testUserId);
    assert.equal(tools.length, 1);
    assert.equal(tools[0].tools[0].name, "desktop_notes_search");

    // Execute tool through gateway
    const execRes = await gateway.executeTool(
      testUserId,
      "local-desktop-tools",
      "desktop_notes_search",
      { query: "roadmap" }
    );

    assert.equal(execRes.success, true);
    assert.equal(execRes.externalState, "CONFIRMED_EXTERNAL_COMMIT");
    assert.ok(execRes.output.content[0].text.includes("meeting notes"));
  });

  await suite.test("MCP-05: Comparative Benchmark & Decision Gate", async () => {
    const suiteRunner = new McpBenchmarkSuite();
    const report = await suiteRunner.runBenchmark(10, testUserId);

    assert.equal(report.testIterations, 10);
    assert.ok(report.nativeRestLatencyMs.avg >= 0);
    assert.ok(report.mcpStdioLatencyMs.avg >= 0);
    assert.equal(report.unknownStateHandlingPassRate, 1.0);
    assert.equal(report.payloadCeilingEnforced, true);

    // Verify Decision Gate Outcome: LIMITED_MCP_DESKTOP_ONLY
    assert.equal(report.decisionGateOutcome, "LIMITED_MCP_DESKTOP_ONLY");
    assert.ok(report.rationale.includes("Native REST remains superior for high-volume cloud services"));
  });

  await suite.test("MCP-06: MongoDB Persistence in UserMcpServerModel", async () => {
    if (mongoose.connection.readyState !== 1) return;

    const count = await UserMcpServerModel.countDocuments({ userId: testUserId });
    assert.ok(count >= 1, `Expected at least 1 user MCP server in DB, found ${count}`);

    const serverDoc = await UserMcpServerModel.findOne({ userId: testUserId });
    assert.ok(serverDoc);
    assert.ok(serverDoc.serverId);
    assert.ok(serverDoc.transportType);
    assert.ok(serverDoc.discoveredTools.length >= 1);
  });
});
