import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { Span } from "../src/model.js";
import { McpHttpProxyClient } from "../src/mcp/http-proxy.js";
import type { SpanSink } from "../src/sink.js";

class MemorySink implements SpanSink {
  spans: Span[] = [];
  emit(span: Span): void { this.spans.push(span); }
  close(): void {}
}

test("forwards Streamable HTTP requests and tracks JSON and SSE responses", async () => {
  const requests: Array<{ body: string; sessionId: string | undefined; protocolVersion: string | undefined }> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      body: Buffer.concat(chunks).toString("utf8"),
      sessionId: headerValue(request.headers["mcp-session-id"]),
      protocolVersion: headerValue(request.headers["mcp-protocol-version"])
    });

    if (requests.length === 1) {
      response.setHeader("mcp-session-id", "session-1");
      response.setHeader("mcp-protocol-version", "2025-03-26");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [{ name: "search", inputSchema: { type: "object" } }] }
      }));
      return;
    }

    response.setHeader("content-type", "text/event-stream");
    response.end(`event: message\ndata: ${JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      result: { content: [{ type: "text", text: "private result" }] }
    })}\n\n`);
  });
  const url = await listen(server);
  const sink = new MemorySink();
  const client = new McpHttpProxyClient({
    url,
    headers: [["authorization", "******"]],
    server: "remote",
    traceId: "trace",
    sessionId: "session",
    sink
  });

  try {
    const listRequest = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const listResponse = await client.send(listRequest);
    assert.deepEqual(JSON.parse(listResponse[0]!), {
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [{ name: "search", inputSchema: { type: "object" } }] }
    });

    const callRequest = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "search", arguments: { secret: "do-not-store" } }
    });
    const callResponse = await client.send(callRequest);
    assert.equal(JSON.parse(callResponse[0]!).id, 2);
    assert.deepEqual(requests.map((request) => request.body), [listRequest, callRequest]);
    assert.equal(requests[0]?.sessionId, undefined);
    assert.equal(requests[1]?.sessionId, "session-1");
    assert.equal(requests[1]?.protocolVersion, "2025-03-26");
    assert.equal(sink.spans.some((span) => span.kind === "mcp.tool.exposed"), true);
    assert.equal(sink.spans.some((span) => span.kind === "mcp.tool.result" && span.success), true);
    assert.equal(JSON.stringify(sink.spans).includes("do-not-store"), false);
    assert.equal(JSON.stringify(sink.spans).includes("private result"), false);
  } finally {
    await close(server);
  }
});

test("returns a JSON-RPC error when an HTTP MCP request fails", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(401, { "content-type": "text/plain" });
    response.end("unauthorized");
  });
  const url = await listen(server);
  const sink = new MemorySink();
  const client = new McpHttpProxyClient({
    url,
    server: "remote",
    traceId: "trace",
    sessionId: "session",
    sink
  });

  try {
    const response = await client.send(JSON.stringify({
      jsonrpc: "2.0",
      id: "req-1",
      method: "tools/call",
      params: { name: "search", arguments: {} }
    }));
    assert.deepEqual(JSON.parse(response[0]!), {
      jsonrpc: "2.0",
      id: "req-1",
      error: { code: -32000, message: "HTTP MCP request failed" }
    });
    assert.equal(sink.spans.some((span) => span.kind === "mcp.tool.result" && span.success === false), true);
  } finally {
    await close(server);
  }
});

async function listen(server: ReturnType<typeof createServer>): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/mcp`;
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(", ") : value;
}
