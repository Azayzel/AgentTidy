export const spanKinds = [
  "chat.session",
  "chat.turn",
  "llm.request",
  "skill.load",
  "mcp.tools.list",
  "mcp.tool.exposed",
  "mcp.tool.call",
  "mcp.tool.result",
  "resource"
] as const;

export type SpanKind = (typeof spanKinds)[number];
export type Confidence = "high" | "medium" | "low";
export type Severity = "info" | "warning" | "error";
export type AttributeValue = string | number | boolean | null;

export interface Span {
  id: string;
  traceId: string;
  sessionId: string;
  parentSpanId?: string;
  startedAt: string;
  durationMs?: number;
  kind: SpanKind;
  name: string;
  success?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  inputBytes?: number;
  outputBytes?: number;
  estimatedCostUsd?: number;
  attributes?: Record<string, AttributeValue>;
}

export interface Finding {
  ruleId: string;
  traceId: string;
  sessionId: string;
  severity: Severity;
  confidence: Confidence;
  title: string;
  detail: string;
  avoidableTokens?: number;
  avoidableCostUsd?: number;
  evidenceSpanIds: string[];
}

export interface UsageBreakdown {
  name: string;
  spans: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface TraceBreakdown extends UsageBreakdown {
  sessionCount: number;
}

export interface Report {
  generatedAt: string;
  traceId?: string;
  totals: {
    spans: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
    estimatedCostUsd: number;
    potentialAvoidableTokens: number;
    mcpCalls: number;
    failedSpans: number;
  };
  breakdown: {
    traces: TraceBreakdown[];
    mcpServers: UsageBreakdown[];
    skills: UsageBreakdown[];
  };
  findings: Finding[];
}
