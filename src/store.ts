import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Span } from "./model.js";

export interface SpanStore {
  add(span: Span): void;
  addMany(spans: readonly Span[]): void;
  list(traceId?: string): Span[];
  close(): void;
}

export class SqliteSpanStore implements SpanStore {
  private readonly db: DatabaseSync;
  private readonly insert;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 5_000 });
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS spans (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        parent_span_id TEXT,
        started_at TEXT NOT NULL,
        duration_ms REAL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        success INTEGER,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cached_tokens INTEGER,
        reasoning_tokens INTEGER,
        input_bytes INTEGER,
        output_bytes INTEGER,
        estimated_cost_usd REAL,
        attributes_json TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(trace_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_spans_session ON spans(session_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_spans_kind ON spans(kind, started_at);
    `);
    this.insert = this.db.prepare(`
      INSERT OR IGNORE INTO spans (
        id, trace_id, session_id, parent_span_id, started_at, duration_ms, kind, name,
        success, input_tokens, output_tokens, cached_tokens, reasoning_tokens,
        input_bytes, output_bytes, estimated_cost_usd, attributes_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  add(span: Span): void {
    this.insert.run(
      span.id,
      span.traceId,
      span.sessionId,
      span.parentSpanId ?? null,
      span.startedAt,
      span.durationMs ?? null,
      span.kind,
      span.name,
      span.success === undefined ? null : Number(span.success),
      span.inputTokens ?? null,
      span.outputTokens ?? null,
      span.cachedTokens ?? null,
      span.reasoningTokens ?? null,
      span.inputBytes ?? null,
      span.outputBytes ?? null,
      span.estimatedCostUsd ?? null,
      span.attributes ? JSON.stringify(span.attributes) : null
    );
  }

  addMany(spans: readonly Span[]): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const span of spans) this.add(span);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  list(traceId?: string): Span[] {
    const rows = traceId
      ? this.db.prepare("SELECT * FROM spans WHERE trace_id = ? ORDER BY started_at").all(traceId)
      : this.db.prepare("SELECT * FROM spans ORDER BY started_at").all();
    return rows.map(rowToSpan);
  }

  close(): void {
    this.db.close();
  }
}

function rowToSpan(row: Record<string, unknown>): Span {
  const span: Span = {
    id: String(row.id),
    traceId: String(row.trace_id),
    sessionId: String(row.session_id),
    startedAt: String(row.started_at),
    kind: String(row.kind) as Span["kind"],
    name: String(row.name)
  };
  setString(span, "parentSpanId", row.parent_span_id);
  setNumber(span, "durationMs", row.duration_ms);
  if (row.success !== null) span.success = Boolean(row.success);
  setNumber(span, "inputTokens", row.input_tokens);
  setNumber(span, "outputTokens", row.output_tokens);
  setNumber(span, "cachedTokens", row.cached_tokens);
  setNumber(span, "reasoningTokens", row.reasoning_tokens);
  setNumber(span, "inputBytes", row.input_bytes);
  setNumber(span, "outputBytes", row.output_bytes);
  setNumber(span, "estimatedCostUsd", row.estimated_cost_usd);
  if (typeof row.attributes_json === "string") {
    const attributes = JSON.parse(row.attributes_json) as Span["attributes"];
    if (attributes) span.attributes = attributes;
  }
  return span;
}

function setString(target: Span, key: "parentSpanId", value: unknown): void {
  if (typeof value === "string") target[key] = value;
}

function setNumber(
  target: Span,
  key: "durationMs" | "inputTokens" | "outputTokens" | "cachedTokens" | "reasoningTokens" | "inputBytes" | "outputBytes" | "estimatedCostUsd",
  value: unknown
): void {
  if (typeof value === "number") target[key] = value;
}
