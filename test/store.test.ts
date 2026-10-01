import assert from "node:assert/strict";
import test from "node:test";
import { SqliteSpanStore } from "../src/store.js";

 test("round-trips spans through SQLite", () => {
  const store = new SqliteSpanStore(":memory:");
  store.add({
    id: "1",
    traceId: "t",
    sessionId: "s",
    startedAt: "2026-10-01T12:00:00.000Z",
    kind: "llm.request",
    name: "model",
    inputTokens: 100,
    attributes: { model: "example" }
  });
  const [span] = store.list("t");
  assert.equal(span?.inputTokens, 100);
  assert.equal(span?.attributes?.model, "example");
  store.close();
});
