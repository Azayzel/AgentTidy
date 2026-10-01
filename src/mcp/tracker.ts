import { performance } from "node:perf_hooks";
import { newId } from "../ids.js";
import { byteLength, stableHash } from "../privacy.js";
import type { Span } from "../model.js";
import type { SpanSink } from "../sink.js";
import { estimateTokens } from "../tokens.js";

type JsonRpcId = string | number | null;
interface PendingRequest {
  method: string;
  startedAt: number;
  requestId: string;
  callSpanId?: string;
  toolName?: string;
  argsHash?: string;
}

export interface McpTrackerOptions {
  server: string;
  traceId: string;
  sessionId: string;
  sink: SpanSink;
}

export class McpTracker {
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly options: McpTrackerOptions) {}

  clientLine(line: string): void {
    const message = parseMessage(line);
    if (!message || !("method" in message) || !isId(message.id)) return;
    const method = typeof message.method === "string" ? message.method : "";
    if (method !== "tools/list" && method !== "tools/call") return;
    const requestId = idKey(message.id);
    const pending: PendingRequest = { method, startedAt: performance.now(), requestId };

    if (method === "tools/call") {
      const params = asRecord(message.params);
      const toolName = typeof params?.name === "string" ? params.name : "unknown";
      const args = params?.arguments ?? null;
      const callSpanId = newId();
      const argsHash = stableHash(args);
      pending.callSpanId = callSpanId;
      pending.toolName = toolName;
      pending.argsHash = argsHash;
      this.options.sink.emit(this.span({
        id: callSpanId,
        kind: "mcp.tool.call",
        name: toolName,
        inputTokens: estimateTokens(JSON.stringify(args)),
        inputBytes: byteLength(args),
        attributes: { server: this.options.server, requestId, argsHash }
      }));
    }
    this.pending.set(requestId, pending);
  }

  serverLine(line: string): void {
    const message = parseMessage(line);
    if (!message || !isId(message.id)) return;
    const requestId = idKey(message.id);
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    const durationMs = performance.now() - pending.startedAt;

    if (pending.method === "tools/list") this.captureToolList(message, pending, durationMs, line);
    if (pending.method === "tools/call") this.captureToolResult(message, pending, durationMs, line);
  }

  private captureToolList(message: Record<string, unknown>, pending: PendingRequest, durationMs: number, line: string): void {
    const result = asRecord(message.result);
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    this.options.sink.emit(this.span({
      id: newId(),
      kind: "mcp.tools.list",
      name: this.options.server,
      durationMs,
      success: !("error" in message),
      outputBytes: Buffer.byteLength(line),
      outputTokens: estimateTokens(line),
      attributes: { server: this.options.server, requestId: pending.requestId, toolCount: tools.length }
    }));

    for (const value of tools) {
      const tool = asRecord(value);
      if (!tool || typeof tool.name !== "string") continue;
      const serialized = JSON.stringify(tool);
      this.options.sink.emit(this.span({
        id: newId(),
        kind: "mcp.tool.exposed",
        name: tool.name,
        attributes: {
          server: this.options.server,
          schemaBytes: Buffer.byteLength(serialized),
          schemaTokens: estimateTokens(serialized),
          definitionHash: stableHash(tool)
        }
      }));
    }
  }

  private captureToolResult(message: Record<string, unknown>, pending: PendingRequest, durationMs: number, line: string): void {
    const result = asRecord(message.result);
    const success = !("error" in message) && result?.isError !== true;
    const attributes: Record<string, string> = {
      server: this.options.server,
      requestId: pending.requestId,
      resultHash: stableHash(message.result ?? message.error ?? null)
    };
    if (pending.argsHash) attributes.argsHash = pending.argsHash;
    const resultSpan: Omit<Span, "traceId" | "sessionId" | "startedAt"> = {
      id: newId(),
      kind: "mcp.tool.result",
      name: pending.toolName ?? "unknown",
      durationMs,
      success,
      outputBytes: Buffer.byteLength(line),
      outputTokens: estimateTokens(line),
      attributes
    };
    if (pending.callSpanId) resultSpan.parentSpanId = pending.callSpanId;
    this.options.sink.emit(this.span(resultSpan));
  }

  private span(input: Omit<Span, "traceId" | "sessionId" | "startedAt">): Span {
    return {
      ...input,
      traceId: this.options.traceId,
      sessionId: this.options.sessionId,
      startedAt: new Date().toISOString()
    };
  }
}

function parseMessage(line: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return asRecord(value);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : undefined;
}

function isId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === "string" || typeof value === "number";
}

function idKey(value: JsonRpcId): string {
  return `${typeof value}:${String(value)}`;
}
