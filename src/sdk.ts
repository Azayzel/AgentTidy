import { newId } from "./ids.js";
import type { AttributeValue, Span, SpanKind } from "./model.js";

export interface SpanInput {
  traceId: string;
  sessionId: string;
  kind: SpanKind;
  name: string;
  parentSpanId?: string;
  durationMs?: number;
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

export function createSpan(input: SpanInput): Span {
  return { id: newId(), startedAt: new Date().toISOString(), ...input };
}

export function createChatTurn(input: {
  traceId: string;
  sessionId: string;
  name?: string;
  newUserTokens: number;
  historyTokens: number;
  systemTokens?: number;
  toolDefinitionTokens?: number;
  skillTokens?: number;
  toolResultTokens?: number;
  classification?: "normal" | "user_correction";
  previousResponseTokens?: number;
}): Span {
  const attributes: Record<string, AttributeValue> = {
    newUserTokens: input.newUserTokens,
    historyTokens: input.historyTokens
  };
  addNumber(attributes, "systemTokens", input.systemTokens);
  addNumber(attributes, "toolDefinitionTokens", input.toolDefinitionTokens);
  addNumber(attributes, "skillTokens", input.skillTokens);
  addNumber(attributes, "toolResultTokens", input.toolResultTokens);
  if (input.classification) attributes.classification = input.classification;
  addNumber(attributes, "previousResponseTokens", input.previousResponseTokens);
  return createSpan({
    traceId: input.traceId,
    sessionId: input.sessionId,
    kind: "chat.turn",
    name: input.name ?? "chat.turn",
    inputTokens:
      input.newUserTokens + input.historyTokens + (input.systemTokens ?? 0) +
      (input.toolDefinitionTokens ?? 0) + (input.skillTokens ?? 0) + (input.toolResultTokens ?? 0),
    attributes
  });
}

export function createLlmRequest(input: {
  traceId: string;
  sessionId: string;
  model: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  estimatedCostUsd?: number;
  durationMs?: number;
  success?: boolean;
}): Span {
  const attributes: Record<string, AttributeValue> = { model: input.model };
  if (input.provider) attributes.provider = input.provider;
  return createSpan({
    traceId: input.traceId,
    sessionId: input.sessionId,
    kind: "llm.request",
    name: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    ...(input.cachedTokens !== undefined ? { cachedTokens: input.cachedTokens } : {}),
    ...(input.reasoningTokens !== undefined ? { reasoningTokens: input.reasoningTokens } : {}),
    ...(input.estimatedCostUsd !== undefined ? { estimatedCostUsd: input.estimatedCostUsd } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(input.success !== undefined ? { success: input.success } : {}),
    attributes
  });
}

export function createSkillLoad(input: {
  traceId: string;
  sessionId: string;
  skill: string;
  contextTokens: number;
  used?: boolean;
}): Span {
  const attributes: Record<string, AttributeValue> = { contextTokens: input.contextTokens };
  if (input.used !== undefined) attributes.used = input.used;
  return createSpan({
    traceId: input.traceId,
    sessionId: input.sessionId,
    kind: "skill.load",
    name: input.skill,
    inputTokens: input.contextTokens,
    attributes
  });
}

export async function sendSpans(baseUrl: string, spans: Span | readonly Span[]): Promise<void> {
  const body = Array.isArray(spans) ? spans : [spans];
  const response = await fetch(new URL("/v1/spans", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`collector returned ${response.status}`);
}

function addNumber(target: Record<string, AttributeValue>, key: string, value: number | undefined): void {
  if (value !== undefined) target[key] = value;
}
