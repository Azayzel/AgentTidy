import { spanKinds, type Span } from "./model.js";

const kindSet = new Set<string>(spanKinds);

export function parseSpan(value: unknown): Span {
  if (!value || typeof value !== "object") throw new Error("span must be an object");
  const input = value as Record<string, unknown>;
  for (const key of ["id", "traceId", "sessionId", "startedAt", "kind", "name"]) {
    if (typeof input[key] !== "string" || input[key] === "") throw new Error(`invalid ${key}`);
  }
  if (!kindSet.has(input.kind as string)) throw new Error("invalid kind");
  if (input.attributes !== undefined && (!input.attributes || typeof input.attributes !== "object" || Array.isArray(input.attributes))) {
    throw new Error("attributes must be an object");
  }
  return value as Span;
}
