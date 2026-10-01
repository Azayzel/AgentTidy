export function estimateTokens(value: string | Buffer | Uint8Array): number {
  const bytes = typeof value === "string" ? Buffer.byteLength(value) : value.byteLength;
  return Math.max(1, Math.ceil(bytes / 4));
}
