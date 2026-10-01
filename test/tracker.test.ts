import assert from "node:assert/strict";
import test from "node:test";
import type { Span } from "../src/model.js";
import { McpTracker } from "../src/mcp/tracker.js";
import type { SpanSink } from "../src/sink.js";

class MemorySink implements SpanSink {
  spans: Span[] = [];
  emit(span: Span): void { this.spans.push(span); }
  close(): void {}
}

test("captures MCP metadata without raw arguments or tool definitions", () => {
  const sink = new MemorySink();
  const tracker = new McpTracker({ server: "demo", traceId: "t", sessionId: "s", sink });

  tracker.clientLine(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
  tracker.serverLine(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "search", description: "Search", inputSchema: { type: "object" } }] } }));
  tracker.clientLine(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search", arguments: { secret: "do-not-store" } } }));
  tracker.serverLine(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: "result" }] } }));

  const exposed = sink.spans.find((span) => span.kind === "mcp.tool.exposed");
  const call = sink.spans.find((span) => span.kind === "mcp.tool.call");
  const result = sink.spans.find((span) => span.kind === "mcp.tool.result");
  assert.ok(exposed && call && result);
  assert.equal(call.name, "search");
  assert.equal(typeof call.attributes?.argsHash, "string");
  assert.equal(JSON.stringify(sink.spans).includes("do-not-store"), false);
  assert.equal(result.success, true);
});
