import type { AttributeValue, Span } from "../model.js";

export function attr(span: Span, key: string): AttributeValue | undefined {
  return span.attributes?.[key];
}

export function stringAttr(span: Span, key: string): string | undefined {
  const value = attr(span, key);
  return typeof value === "string" ? value : undefined;
}

export function numberAttr(span: Span, key: string): number | undefined {
  const value = attr(span, key);
  return typeof value === "number" ? value : undefined;
}

export function booleanAttr(span: Span, key: string): boolean | undefined {
  const value = attr(span, key);
  return typeof value === "boolean" ? value : undefined;
}

export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const group = groups.get(groupKey);
    if (group) group.push(item);
    else groups.set(groupKey, [item]);
  }
  return groups;
}
