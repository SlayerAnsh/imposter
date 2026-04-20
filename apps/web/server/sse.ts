import type { ServerToClientSignal } from "@imposter/net";

const encoder = new TextEncoder();

export interface SseChannel {
  write(event: ServerToClientSignal): void;
  ping(): void;
  close(): void;
  readonly stream: ReadableStream<Uint8Array>;
  readonly closed: Promise<void>;
}

export function createSseChannel(): SseChannel {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((res) => {
    resolveClosed = res;
  });
  let isClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      if (!isClosed) {
        isClosed = true;
        resolveClosed();
      }
    },
  });

  function write(event: ServerToClientSignal) {
    if (isClosed) return;
    try {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
      );
    } catch {
      close();
    }
  }

  function ping() {
    if (isClosed) return;
    try {
      controller.enqueue(encoder.encode(`: ping\n\n`));
    } catch {
      close();
    }
  }

  function close() {
    if (isClosed) return;
    isClosed = true;
    try {
      controller.close();
    } catch {}
    resolveClosed();
  }

  return { write, ping, close, stream, closed };
}

export const SSE_HEADERS: HeadersInit = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};
