import assert from "node:assert/strict";
import test from "node:test";
import { buildReport } from "../src/analyze.js";
import type { Span } from "../src/model.js";

const base = {
  traceId: "trace-1",
  sessionId: "session-1",
  startedAt: "2026-10-01T12:00:00.000Z"
};

function span(input: Partial<Span> & Pick<Span, "id" | "kind" | "name">): Span {
  return { ...base, ...input };
}

test("flags unused MCP tool exposure", () => {
  const spans: Span[] = Array.from({ length: 6 }, (_, i) => span({
    id: `tool-${i}`,
    kind: "mcp.tool.exposed",
    name: `tool${i}`,
    attributes: { server: "github", schemaTokens: 500 }
  }));
  spans.push(span({
    id: "call-1",
    kind: "mcp.tool.call",
    name: "tool0",
    attributes: { server: "github", argsHash: "a", requestId: "1" }
  }));

  const finding = buildReport(spans).findings.find((item) => item.ruleId === "MCP001");
  assert.ok(finding);
  assert.equal(finding.avoidableTokens, 2500);
});

test("flags duplicate MCP invocations and counts duplicate result tokens", () => {
  const spans: Span[] = [
    span({ id: "c1", kind: "mcp.tool.call", name: "read", inputTokens: 10, attributes: { server: "fs", argsHash: "same", requestId: "1" } }),
    span({ id: "r1", kind: "mcp.tool.result", name: "read", outputTokens: 100, attributes: { server: "fs", argsHash: "same", requestId: "1", resultHash: "r" } }),
    span({ id: "c2", kind: "mcp.tool.call", name: "read", inputTokens: 10, attributes: { server: "fs", argsHash: "same", requestId: "2" } }),
    span({ id: "r2", kind: "mcp.tool.result", name: "read", outputTokens: 100, attributes: { server: "fs", argsHash: "same", requestId: "2", resultHash: "r" } })
  ];

  const finding = buildReport(spans).findings.find((item) => item.ruleId === "MCP003");
  assert.ok(finding);
  assert.equal(finding.avoidableTokens, 110);
});

test("flags bloated chat context", () => {
  const report = buildReport([
    span({ id: "turn", kind: "chat.turn", name: "turn", attributes: { historyTokens: 12000, newUserTokens: 200 } })
  ]);
  assert.ok(report.findings.some((item) => item.ruleId === "CHAT001"));
});

test("flags unused loaded skill", () => {
  const report = buildReport([
    span({ id: "skill", kind: "skill.load", name: "db", attributes: { contextTokens: 4500, used: false } })
  ]);
  assert.ok(report.findings.some((item) => item.ruleId === "SKILL001"));
  assert.ok(report.findings.some((item) => item.ruleId === "SKILL003"));
});


test("reports MCP, skill, and trace breakdowns", () => {
  const report = buildReport([
    span({ id: "m1", kind: "mcp.tool.call", name: "read", inputTokens: 10, attributes: { server: "github", argsHash: "x", requestId: "1" } }),
    span({ id: "m2", kind: "mcp.tool.result", name: "read", outputTokens: 90, attributes: { server: "github", argsHash: "x", requestId: "1" } }),
    span({ id: "s1", kind: "skill.load", name: "repo", inputTokens: 300 })
  ]);
  assert.equal(report.breakdown.traces[0]?.name, "trace-1");
  assert.equal(report.breakdown.mcpServers[0]?.name, "github");
  assert.equal(report.breakdown.mcpServers[0]?.calls, 1);
  assert.equal(report.breakdown.skills[0]?.inputTokens, 300);
});

test("does not count mutable duplicate results as avoidable", () => {
  const report = buildReport([
    span({ id: "c1x", kind: "mcp.tool.call", name: "status", inputTokens: 10, attributes: { server: "api", argsHash: "same", requestId: "1" } }),
    span({ id: "r1x", kind: "mcp.tool.result", name: "status", outputTokens: 20, attributes: { server: "api", requestId: "1", resultHash: "one" } }),
    span({ id: "c2x", kind: "mcp.tool.call", name: "status", inputTokens: 10, attributes: { server: "api", argsHash: "same", requestId: "2" } }),
    span({ id: "r2x", kind: "mcp.tool.result", name: "status", outputTokens: 20, attributes: { server: "api", requestId: "2", resultHash: "two" } })
  ]);
  const finding = report.findings.find((item) => item.ruleId === "MCP003");
  assert.ok(finding);
  assert.equal(finding.confidence, "medium");
  assert.equal(finding.avoidableTokens, undefined);
});
