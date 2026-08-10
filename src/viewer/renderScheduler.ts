export interface RenderSchedulerSnapshot {
  concurrency: number;
  active: number;
  queued: number;
  completed: number;
  cancelled: number;
}

export type RenderPriority = "high" | "normal" | "low";

type QueueItem<T> = {
  run: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal;
  priority: number;
  sequence: number;
};

const PRIORITY: Record<RenderPriority, number> = { high: 2, normal: 1, low: 0 };

export class RenderScheduler {
  readonly concurrency: number;
  private readonly queue: QueueItem<unknown>[] = [];
  private active = 0;
  private completed = 0;
  private cancelled = 0;
  private sequence = 0;

  constructor(concurrency: number) {
    this.concurrency = Math.max(1, Math.floor(concurrency));
  }

  run<T>(run: () => Promise<T>, signal?: AbortSignal, priority: RenderPriority = "normal"): Promise<T> {
    if (signal?.aborted) return Promise.reject(createAbortError());
    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = { run, resolve, reject, signal, priority: PRIORITY[priority], sequence: this.sequence++ };
      this.queue.push(item as QueueItem<unknown>);
      this.queue.sort((left, right) => right.priority - left.priority || left.sequence - right.sequence);
      this.pump();
    });
  }

  snapshot(): RenderSchedulerSnapshot {
    return { concurrency: this.concurrency, active: this.active, queued: this.queue.length, completed: this.completed, cancelled: this.cancelled };
  }

  clear(): void {
    while (this.queue.length) {
      const item = this.queue.shift();
      if (!item) break;
      this.cancelled += 1;
      item.reject(createAbortError());
    }
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length) {
      const item = this.queue.shift();
      if (!item) break;
      if (item.signal?.aborted) {
        this.cancelled += 1;
        item.reject(createAbortError());
        continue;
      }
      this.active += 1;
      void item.run().then(
        (value) => { this.completed += 1; item.resolve(value); },
        (reason) => { if (isAbort(reason)) this.cancelled += 1; item.reject(reason); }
      ).finally(() => { this.active -= 1; this.pump(); });
    }
  }
}

function createAbortError(): DOMException {
  return new DOMException("Render was cancelled.", "AbortError");
}

function isAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}
