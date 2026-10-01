import type { Finding, Span } from "../model.js";
import { booleanAttr, numberAttr } from "./helpers.js";

export function analyzeSkills(spans: readonly Span[]): Finding[] {
  const findings: Finding[] = [];
  for (const span of spans.filter((item) => item.kind === "skill.load")) {
    const contextTokens = numberAttr(span, "contextTokens") ?? span.inputTokens ?? 0;
    const used = booleanAttr(span, "used");
    if (contextTokens >= 4_000) {
      findings.push({
        ruleId: "SKILL003",
        traceId: span.traceId,
        sessionId: span.sessionId,
        severity: "warning",
        confidence: "high",
        title: "Large skill context",
        detail: `${span.name} injected ~${contextTokens} tokens of context.`,
        evidenceSpanIds: [span.id]
      });
    }
    if (used === false && contextTokens > 0) {
      findings.push({
        ruleId: "SKILL001",
        traceId: span.traceId,
        sessionId: span.sessionId,
        severity: "warning",
        confidence: "high",
        title: "Unused loaded skill",
        detail: `${span.name} loaded ~${contextTokens} tokens but was marked unused.`,
        avoidableTokens: contextTokens,
        evidenceSpanIds: [span.id]
      });
    }
  }
  return findings;
}
