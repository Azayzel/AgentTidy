import type { Finding, Span } from "../model.js";
import { numberAttr, stringAttr } from "./helpers.js";

export function analyzeChat(spans: readonly Span[]): Finding[] {
  const findings: Finding[] = [];
  for (const span of spans.filter((item) => item.kind === "chat.turn")) {
    const history = numberAttr(span, "historyTokens") ?? 0;
    const fresh = numberAttr(span, "newUserTokens") ?? 0;
    const total = history + fresh;
    if (history >= 10_000 && total > 0 && history / total >= 0.75) {
      findings.push({
        ruleId: "CHAT001",
        traceId: span.traceId,
        sessionId: span.sessionId,
        severity: "warning",
        confidence: "high",
        title: "Conversation context dominates the turn",
        detail: `${Math.round((history / total) * 100)}% of user/history tokens are historical context (${history} history vs ${fresh} new).`,
        evidenceSpanIds: [span.id]
      });
    }
    if (stringAttr(span, "classification") === "user_correction") {
      const previousResponseTokens = numberAttr(span, "previousResponseTokens") ?? 0;
      const finding: Finding = {
        ruleId: "CHAT002",
        traceId: span.traceId,
        sessionId: span.sessionId,
        severity: "info",
        confidence: "medium",
        title: "Potential correction tax",
        detail: `A user correction followed a response of ~${previousResponseTokens} tokens.`,
        evidenceSpanIds: [span.id]
      };
      if (previousResponseTokens > 0) finding.avoidableTokens = previousResponseTokens;
      findings.push(finding);
    }
  }
  return findings;
}
