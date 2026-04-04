export interface TaskQueueOptions {
  timeoutMs: number;
  maxRetries: number;
}

interface InFlightTask<T> {
  controller: AbortController;
  promise: Promise<T>;
}

export class TaskQueue {
  private inFlight = new Map<string, InFlightTask<unknown>>();

  constructor(private options: TaskQueueOptions) {}

  enqueue<T>(key: string, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing.promise as Promise<T>;
    }

    const controller = new AbortController();
    const promise = this.runWithRetry(task, this.options.maxRetries, controller).finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, { controller, promise });
    return promise;
  }

  clear(): void {
    this.inFlight.forEach(({ controller }) => controller.abort(new Error('Task queue cleared.')));
    this.inFlight.clear();
  }

  cancel(key: string, reason: Error = new Error('Task cancelled.')): void {
    this.inFlight.get(key)?.controller.abort(reason);
  }

  cancelByPrefix(prefix: string, reason: Error = new Error('Task cancelled.')): void {
    this.inFlight.forEach(({ controller }, key) => {
      if (key.startsWith(prefix)) {
        controller.abort(reason);
      }
    });
  }

  private async runWithRetry<T>(
    task: (signal: AbortSignal) => Promise<T>,
    retriesRemaining: number,
    controller: AbortController
  ): Promise<T> {
    try {
      return await this.runWithTimeout(task, controller);
    } catch (error) {
      if (controller.signal.aborted) {
        throw error;
      }
      if (retriesRemaining <= 0) {
        throw error;
      }
      return this.runWithRetry(task, retriesRemaining - 1, controller);
    }
  }

  private async runWithTimeout<T>(task: (signal: AbortSignal) => Promise<T>, controller: AbortController): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const abortError = () => controller.signal.reason ?? new Error('Task cancelled.');
    const abortListener = (reject: (reason?: unknown) => void) => () => reject(abortError());

    try {
      const aborted = new Promise<T>((_, reject) => {
        controller.signal.addEventListener('abort', abortListener(reject), { once: true });
      });

      timeoutId = setTimeout(() => {
        controller.abort(new Error(`Task timed out after ${this.options.timeoutMs}ms`));
      }, this.options.timeoutMs);

      return await Promise.race([task(controller.signal), aborted]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
