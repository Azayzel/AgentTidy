import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { buildReport } from "../analyze.js";
import { dashboardHtml } from "../dashboard.js";
import type { Span } from "../model.js";
import type { SpanStore } from "../store.js";
import { parseSpan } from "../validate.js";

export interface CollectorOptions {
  host: string;
  port: number;
  store: SpanStore;
}

export function startCollector(options: CollectorOptions) {
  const server = createServer(async (request, response) => {
    try {
      await route(request, response, options.store);
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : "request failed" });
    }
  });
  server.listen(options.port, options.host);
  return server;
}

async function route(request: IncomingMessage, response: ServerResponse, store: SpanStore): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { ok: true });
  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(dashboardHtml);
    return;
  }
  if (request.method === "GET" && url.pathname === "/v1/report") {
    const traceId = url.searchParams.get("traceId") ?? undefined;
    return json(response, 200, buildReport(store.list(traceId), traceId));
  }
  if (request.method === "POST" && url.pathname === "/v1/spans") {
    const body = await readJson(request, 2 * 1024 * 1024);
    const rawSpans = Array.isArray(body) ? body : [body];
    const spans: Span[] = rawSpans.map(parseSpan);
    store.addMany(spans);
    return json(response, 202, { accepted: spans.length });
  }
  json(response, 404, { error: "not found" });
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error("request body too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}
