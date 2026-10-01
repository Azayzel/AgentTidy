import { once } from "node:events";
import { createInterface } from "node:readline";
import type { SpanSink } from "../sink.js";
import { McpTracker } from "./tracker.js";

export interface McpHttpProxyOptions {
  url: string;
  headers?: Array<[string, string]>;
  server: string;
  traceId: string;
  sessionId: string;
  sink: SpanSink;
}

export class McpHttpProxyClient {
  private readonly endpoint: URL;
  private readonly headers: Headers;
  private sessionId: string | undefined;
  private protocolVersion: string | undefined;
  private readonly tracker: McpTracker;

  constructor(private readonly options: McpHttpProxyOptions) {
    this.endpoint = new URL(options.url);
    if (this.endpoint.protocol !== "http:" && this.endpoint.protocol !== "https:") {
      throw new Error("MCP server URL must use http or https");
    }
    this.headers = new Headers(options.headers);
    this.tracker = new McpTracker(options);
  }

  async send(line: string): Promise<string[]> {
    this.tracker.clientLine(line);
    const request = parseRecord(line);
    const headers = new Headers(this.headers);
    headers.set("accept", "application/json, text/event-stream");
    headers.set("content-type", "application/json");
    if (this.sessionId) headers.set("mcp-session-id", this.sessionId);
    if (this.protocolVersion && request?.method !== "initialize") {
      headers.set("mcp-protocol-version", this.protocolVersion);
    }
    const requestVersion = stringValue(record(request?.params)?.protocolVersion);

    try {
      const response = await fetch(this.endpoint, { method: "POST", headers, body: line });
      this.sessionId = response.headers.get("mcp-session-id") ?? this.sessionId;
      this.protocolVersion = response.headers.get("mcp-protocol-version") ?? requestVersion ?? this.protocolVersion;
      const body = await response.text();
      const messages = response.headers.get("content-type")?.includes("text/event-stream")
        ? parseSse(body)
        : parseJson(body);
      const initializedVersion = stringValue(record(messages.find((message) => message.id === request?.id)?.result)?.protocolVersion);

      if (messages.length > 0) {
        this.protocolVersion = response.headers.get("mcp-protocol-version") ?? initializedVersion ?? requestVersion ?? this.protocolVersion;
        for (const message of messages) this.tracker.serverLine(JSON.stringify(message));
        return messages.map((message) => JSON.stringify(message));
      }
      if (!response.ok) return this.errorResponse(request);
      return [];
    } catch {
      return this.errorResponse(request);
    }
  }

  private errorResponse(request: Record<string, unknown> | undefined): string[] {
    if (!request || !isId(request.id)) return [];
    const response = JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32000, message: "HTTP MCP request failed" }
    });
    this.tracker.serverLine(response);
    return [response];
  }
}

export async function runMcpHttpProxy(options: McpHttpProxyOptions): Promise<number> {
  const client = new McpHttpProxyClient(options);
  const pending = new Set<Promise<void>>();
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

  try {
    for await (const line of input) {
      const task = client.send(line).then(async (messages) => {
        for (const message of messages) {
          if (!process.stdout.write(`${message}\n`)) await once(process.stdout, "drain");
        }
      }).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
      }).finally(() => pending.delete(task));
      pending.add(task);
    }
    await Promise.all(pending);
    return 0;
  } finally {
    await options.sink.close();
  }
}

function parseJson(body: string): Record<string, unknown>[] {
  if (!body.trim()) return [];
  try {
    const value: unknown = JSON.parse(body);
    return Array.isArray(value)
      ? value.filter(isRecord)
      : isRecord(value) ? [value] : [];
  } catch {
    return [];
  }
}

function parseSse(body: string): Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = [];
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    messages.push(...parseJson(data));
  }
  return messages;
}

function parseRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isId(value: unknown): value is string | number | null {
  return value === null || typeof value === "string" || typeof value === "number";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
