import type { Span } from "./model.js";
import type { SpanStore } from "./store.js";

export interface SpanSink {
  emit(span: Span): void;
  close(): Promise<void> | void;
}

export class StoreSink implements SpanSink {
  constructor(private readonly store: SpanStore) {}

  emit(span: Span): void {
    this.store.add(span);
  }

  close(): void {
    this.store.close();
  }
}

export class HttpSink implements SpanSink {
  private pending: Span[] = [];
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly baseUrl: string, private readonly batchSize = 25) {}

  emit(span: Span): void {
    this.pending.push(span);
    if (this.pending.length >= this.batchSize) this.enqueueFlush();
  }

  async close(): Promise<void> {
    this.enqueueFlush();
    await this.chain;
  }

  private enqueueFlush(): void {
    if (this.pending.length === 0) return;
    const batch = this.pending.splice(0, this.pending.length);
    this.chain = this.chain.then(async () => {
      const response = await fetch(new URL("/v1/spans", this.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(batch)
      });
      if (!response.ok) throw new Error(`collector returned ${response.status}`);
    });
  }
}
