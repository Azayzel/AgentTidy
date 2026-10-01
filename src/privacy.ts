import { createHash } from "node:crypto";

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

export function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null));
}
