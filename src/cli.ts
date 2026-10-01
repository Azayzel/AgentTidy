#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { buildReport } from "./analyze.js";
import { startCollector } from "./collector/server.js";
import { newId } from "./ids.js";
import { runMcpHttpProxy } from "./mcp/http-proxy.js";
import { runMcpProxy } from "./mcp/proxy.js";
import type { Report } from "./model.js";
import { HttpSink, StoreSink, type SpanSink } from "./sink.js";
import { SqliteSpanStore } from "./store.js";

const DEFAULT_DB = join(homedir(), ".agenttidy", "telemetry.db");

async function main(args: string[]): Promise<void> {
  const [command = "help", ...rest] = args;
  if (command === "serve") return serve(rest);
  if (command === "report") return report(rest);
  if (command === "mcp") return mcp(rest);
  help(command === "help" ? undefined : `unknown command: ${command}`);
  if (command !== "help") process.exitCode = 1;
}

function serve(args: string[]): void {
  const host = option(args, "--host") ?? "127.0.0.1";
  const port = numberOption(args, "--port", 4318);
  const dbPath = option(args, "--db") ?? DEFAULT_DB;
  const store = new SqliteSpanStore(dbPath);
  const server = startCollector({ host, port, store });
  console.error(`collector: http://${host}:${port}`);
  console.error(`database:  ${dbPath}`);

  const stop = () => server.close(() => {
    store.close();
    process.exit(0);
  });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

function report(args: string[]): void {
  const dbPath = option(args, "--db") ?? DEFAULT_DB;
  const traceId = option(args, "--trace");
  const store = new SqliteSpanStore(dbPath);
  try {
    const result = buildReport(store.list(traceId), traceId);
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else printReport(result);
  } finally {
    store.close();
  }
}

async function mcp(args: string[]): Promise<void> {
  const separator = args.indexOf("--");
  const options = separator < 0 ? args : args.slice(0, separator);
  const url = option(options, "--url");
  if (url && separator >= 0) throw new Error("--url cannot be combined with a server command");
  if (!url && (separator < 0 || separator === args.length - 1)) throw new Error("mcp requires: --url URL or -- <server command> [args]");
  const command = separator >= 0 ? args[separator + 1] : undefined;
  if (!url && !command) throw new Error("missing MCP server command");
  const commandArgs = separator >= 0 ? args.slice(separator + 2) : [];
  const server = option(options, "--server") ?? (url ? new URL(url).hostname : command!);
  const traceId = option(options, "--trace") ?? process.env.AGENT_TRACE_ID ?? newId();
  const sessionId = option(options, "--session") ?? process.env.AGENT_SESSION_ID ?? traceId;
  const collector = option(options, "--collector") ?? process.env.AGENTTIDY_URL;
  let sink: SpanSink;
  if (collector) sink = new HttpSink(collector);
  else sink = new StoreSink(new SqliteSpanStore(option(options, "--db") ?? DEFAULT_DB));

  const code = url
    ? await runMcpHttpProxy({ url, headers: headerOptions(options), server, traceId, sessionId, sink })
    : await runMcpProxy({ command: command!, args: commandArgs, server, traceId, sessionId, sink });
  process.exitCode = code;
}

function headerOptions(args: readonly string[]): Array<[string, string]> {
  const headers: Array<[string, string]> = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--header") continue;
    const value = args[index + 1];
    const separator = value?.indexOf(":") ?? -1;
    if (separator < 1) throw new Error("--header requires a NAME: VALUE");
    headers.push([value!.slice(0, separator).trim(), value!.slice(separator + 1).trim()]);
    index += 1;
  }
  return headers;
}

function printReport(report: Report): void {
  const t = report.totals;
  console.log(`Spans: ${t.spans}`);
  console.log(`Tokens: ${t.inputTokens} in / ${t.outputTokens} out / ${t.cachedTokens} cached`);
  console.log(`MCP calls: ${t.mcpCalls} | Failed spans: ${t.failedSpans}`);
  console.log(`Reported cost: $${t.estimatedCostUsd.toFixed(4)} | Potential avoidable tokens: ~${t.potentialAvoidableTokens}`);
  printBreakdown("MCP servers", report.breakdown.mcpServers);
  printBreakdown("Skills", report.breakdown.skills);
  console.log("");
  if (report.findings.length === 0) {
    console.log("No findings.");
    return;
  }
  for (const finding of report.findings) {
    const tokens = finding.avoidableTokens === undefined ? "" : ` | ~${finding.avoidableTokens} potential tokens`;
    console.log(`${finding.ruleId} [${finding.severity}/${finding.confidence}] ${finding.title}${tokens}`);
    console.log(`  ${finding.detail}`);
  }
}

function printBreakdown(title: string, rows: Report["breakdown"]["mcpServers"]): void {
  if (rows.length === 0) return;
  console.log(`\n${title}:`);
  for (const row of rows.slice(0, 8)) {
    console.log(`  ${row.name}: ${row.calls} calls, ${row.inputTokens + row.outputTokens} tokens, $${row.estimatedCostUsd.toFixed(4)}`);
  }
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function numberOption(args: readonly string[], name: string, fallback: number): number {
  const raw = option(args, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} must be a valid port`);
  return value;
}

function help(error?: string): void {
  if (error) console.error(error);
  console.log(`agenttidy\n\nCommands:\n  serve  [--host 127.0.0.1] [--port 4318] [--db PATH]\n  report [--db PATH] [--trace ID] [--json]\n  mcp    [--server NAME] [--collector URL | --db PATH] [--trace ID] [--session ID] -- COMMAND [ARGS]\n  mcp    [--server NAME] [--url URL] [--header NAME:VALUE]... [--collector URL | --db PATH] [--trace ID] [--session ID]\n`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
