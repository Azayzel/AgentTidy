import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { Transform } from "node:stream";
import type { SpanSink } from "../sink.js";
import { McpTracker } from "./tracker.js";

export interface McpProxyOptions {
  command: string;
  args: string[];
  server: string;
  traceId: string;
  sessionId: string;
  sink: SpanSink;
}

export async function runMcpProxy(options: McpProxyOptions): Promise<number> {
  const child = spawn(options.command, options.args, { stdio: ["pipe", "pipe", "inherit"], env: process.env });
  const tracker = new McpTracker(options);
  const clientTap = createLineTap((line) => tracker.clientLine(line));
  const serverTap = createLineTap((line) => tracker.serverLine(line));

  process.stdin.pipe(clientTap).pipe(child.stdin);
  child.stdout.pipe(serverTap).pipe(process.stdout);

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  await options.sink.close();
  return exitCode;
}

function createLineTap(onLine: (line: string) => void): Transform {
  const decoder = new StringDecoder("utf8");
  let buffer = "";

  const drain = (final = false) => {
    const parts = buffer.split(/\r?\n/);
    const tail = parts.pop() ?? "";
    for (const line of parts) if (line.trim()) onLine(line);
    if (final) {
      if (tail.trim()) onLine(tail);
      buffer = "";
    } else {
      buffer = tail;
    }
  };

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      buffer += decoder.write(chunk);
      drain();
      callback(null, chunk);
    },
    flush(callback) {
      buffer += decoder.end();
      drain(true);
      callback();
    }
  });
}
