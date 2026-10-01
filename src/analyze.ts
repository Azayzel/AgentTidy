import type { Report, Span, TraceBreakdown, UsageBreakdown } from "./model.js";
import { analyzeChat } from "./rules/chat.js";
import { groupBy, stringAttr } from "./rules/helpers.js";
import { analyzeMcp } from "./rules/mcp.js";
import { analyzeSkills } from "./rules/skill.js";

export function buildReport(spans: readonly Span[], traceId?: string): Report {
  const selected = traceId ? spans.filter((span) => span.traceId === traceId) : [...spans];
  const findings = [...analyzeMcp(selected), ...analyzeChat(selected), ...analyzeSkills(selected)].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity)
  );
  return {
    generatedAt: new Date().toISOString(),
    ...(traceId ? { traceId } : {}),
    totals: {
      spans: selected.length,
      inputTokens: sum(selected, "inputTokens"),
      outputTokens: sum(selected, "outputTokens"),
      cachedTokens: sum(selected, "cachedTokens"),
      reasoningTokens: sum(selected, "reasoningTokens"),
      estimatedCostUsd: sum(selected, "estimatedCostUsd"),
      potentialAvoidableTokens: findings.reduce((total, finding) => total + (finding.avoidableTokens ?? 0), 0),
      mcpCalls: selected.filter((span) => span.kind === "mcp.tool.call").length,
      failedSpans: selected.filter((span) => span.success === false).length
    },
    breakdown: {
      traces: traceBreakdown(selected),
      mcpServers: usageBreakdown(selected.filter((span) => span.kind.startsWith("mcp.")), (span) => stringAttr(span, "server")),
      skills: usageBreakdown(selected.filter((span) => span.kind === "skill.load"), (span) => span.name)
    },
    findings
  };
}

function traceBreakdown(spans: readonly Span[]): TraceBreakdown[] {
  const groups = groupBy(spans, (span) => span.traceId);
  return [...groups.entries()]
    .map(([traceId, group]) => ({
      ...summarize(traceId, group),
      sessionCount: new Set(group.map((span) => span.sessionId)).size
    }))
    .sort(byCostThenTokens);
}

function usageBreakdown(spans: readonly Span[], key: (span: Span) => string | undefined): UsageBreakdown[] {
  const keyed = spans.filter((span) => key(span));
  const groups = groupBy(keyed, (span) => key(span) ?? "unknown");
  return [...groups.entries()].map(([name, group]) => summarize(name, group)).sort(byCostThenTokens);
}

function summarize(name: string, spans: readonly Span[]): UsageBreakdown {
  return {
    name,
    spans: spans.length,
    calls: spans.filter((span) => span.kind === "mcp.tool.call").length,
    inputTokens: sum(spans, "inputTokens"),
    outputTokens: sum(spans, "outputTokens"),
    estimatedCostUsd: sum(spans, "estimatedCostUsd")
  };
}

function byCostThenTokens(a: UsageBreakdown, b: UsageBreakdown): number {
  const cost = b.estimatedCostUsd - a.estimatedCostUsd;
  return cost !== 0 ? cost : (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens);
}

function sum(spans: readonly Span[], key: "inputTokens" | "outputTokens" | "cachedTokens" | "reasoningTokens" | "estimatedCostUsd"): number {
  return spans.reduce((total, span) => total + (span[key] ?? 0), 0);
}

function severityRank(value: "info" | "warning" | "error"): number {
  return value === "error" ? 3 : value === "warning" ? 2 : 1;
}
