import type { Finding, Span } from "../model.js";
import { groupBy, numberAttr, stringAttr } from "./helpers.js";

export function analyzeMcp(spans: readonly Span[]): Finding[] {
  return [
    ...unusedToolExposure(spans),
    ...oversizedSchemas(spans),
    ...duplicateCalls(spans),
    ...excessiveResults(spans),
    ...repeatedFailures(spans)
  ];
}

function unusedToolExposure(spans: readonly Span[]): Finding[] {
  const exposed = spans.filter((span) => span.kind === "mcp.tool.exposed");
  const calls = spans.filter((span) => span.kind === "mcp.tool.call");
  const bySession = groupBy(exposed, (span) => `${span.sessionId}|${stringAttr(span, "server") ?? "unknown"}`);
  const findings: Finding[] = [];

  for (const group of bySession.values()) {
    const sample = group[0];
    if (!sample) continue;
    const server = stringAttr(sample, "server") ?? "unknown";
    const tools = new Map<string, Span>();
    for (const span of group) tools.set(span.name, span);
    const used = new Set(
      calls
        .filter((span) => span.sessionId === sample.sessionId && stringAttr(span, "server") === server)
        .map((span) => span.name)
    );
    const unused = [...tools.values()].filter((span) => !used.has(span.name));
    if (tools.size < 5 || unused.length < 3 || unused.length / tools.size < 0.5) continue;
    const schemaTokens = unused.reduce((sum, span) => sum + (numberAttr(span, "schemaTokens") ?? 0), 0);
    findings.push({
      ruleId: "MCP001",
      traceId: sample.traceId,
      sessionId: sample.sessionId,
      severity: "warning",
      confidence: "medium",
      title: "Mostly unused MCP tool exposure",
      detail: `${unused.length}/${tools.size} tools from ${server} were exposed but not called; unused schemas total ~${schemaTokens} tokens.`,
      avoidableTokens: schemaTokens,
      evidenceSpanIds: unused.map((span) => span.id)
    });
  }
  return findings;
}

function oversizedSchemas(spans: readonly Span[]): Finding[] {
  const findings: Finding[] = [];
  for (const span of spans.filter((item) => item.kind === "mcp.tool.exposed")) {
    const schemaTokens = numberAttr(span, "schemaTokens") ?? 0;
    if (schemaTokens < 1_000) continue;
    findings.push({
      ruleId: "MCP002",
      traceId: span.traceId,
      sessionId: span.sessionId,
      severity: "warning",
      confidence: "high",
      title: "Oversized MCP tool schema",
      detail: `${span.name} exposes ~${schemaTokens} schema tokens.`,
      avoidableTokens: schemaTokens,
      evidenceSpanIds: [span.id]
    });
  }
  return findings;
}

function duplicateCalls(spans: readonly Span[]): Finding[] {
  const calls = spans.filter((span) => span.kind === "mcp.tool.call" && stringAttr(span, "argsHash"));
  const groups = groupBy(calls, (span) =>
    [span.sessionId, stringAttr(span, "server") ?? "unknown", span.name, stringAttr(span, "argsHash")].join("|")
  );
  const resultsByRequest = new Map<string, Span>();
  for (const result of spans.filter((span) => span.kind === "mcp.tool.result")) {
    const requestId = stringAttr(result, "requestId");
    if (requestId) resultsByRequest.set(`${result.sessionId}|${requestId}`, result);
  }
  const findings: Finding[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const first = group[0];
    if (!first) continue;
    const matchedResults = group.map((call) => {
      const requestId = stringAttr(call, "requestId");
      return requestId ? resultsByRequest.get(`${call.sessionId}|${requestId}`) : undefined;
    });
    const resultHashes = matchedResults.map((result) => result ? stringAttr(result, "resultHash") : undefined);
    const firstHash = resultHashes[0];
    const identicalResults = Boolean(firstHash) && resultHashes.every((hash) => hash === firstHash);
    const evidence = [...group.map((span) => span.id), ...matchedResults.filter((span): span is Span => Boolean(span)).map((span) => span.id)];
    const finding: Finding = {
      ruleId: "MCP003",
      traceId: first.traceId,
      sessionId: first.sessionId,
      severity: "warning",
      confidence: identicalResults ? "high" : "medium",
      title: "Duplicate MCP invocation",
      detail: `${first.name} was called ${group.length} times with identical arguments${identicalResults ? " and identical results" : ""}.`,
      evidenceSpanIds: evidence
    };
    if (identicalResults) {
      finding.avoidableTokens = group.slice(1).reduce((total, call, index) => {
        const result = matchedResults[index + 1];
        return total + (call.inputTokens ?? 0) + (result?.outputTokens ?? 0);
      }, 0);
    }
    findings.push(finding);
  }
  return findings;
}

function excessiveResults(spans: readonly Span[]): Finding[] {
  return spans
    .filter((span) => span.kind === "mcp.tool.result" && (span.outputTokens ?? 0) >= 8_000)
    .map((span) => ({
      ruleId: "MCP004",
      traceId: span.traceId,
      sessionId: span.sessionId,
      severity: "warning" as const,
      confidence: "high" as const,
      title: "Large MCP result",
      detail: `${span.name} returned ~${span.outputTokens} tokens; prefer filtering, pagination, or a narrower response.`,
      evidenceSpanIds: [span.id]
    }));
}

function repeatedFailures(spans: readonly Span[]): Finding[] {
  const failures = spans.filter(
    (span) => span.kind === "mcp.tool.result" && span.success === false && stringAttr(span, "argsHash")
  );
  const groups = groupBy(failures, (span) =>
    [span.sessionId, stringAttr(span, "server") ?? "unknown", span.name, stringAttr(span, "argsHash")].join("|")
  );
  const findings: Finding[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const first = group[0];
    if (!first) continue;
    findings.push({
      ruleId: "MCP005",
      traceId: first.traceId,
      sessionId: first.sessionId,
      severity: "warning",
      confidence: "high",
      title: "Repeated failed MCP call",
      detail: `${first.name} failed ${group.length} times with identical arguments; fail fast or add a circuit breaker.`,
      avoidableTokens: group.slice(1).reduce((sum, span) => sum + (span.outputTokens ?? 0), 0),
      evidenceSpanIds: group.map((span) => span.id)
    });
  }
  return findings;
}
