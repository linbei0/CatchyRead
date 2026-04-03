export interface TaskQueueOptions {
  timeoutMs: number;
  maxRetries: number;
}

export class TaskQueue {
  private inFlight = new Map<string, Promise<unknown>>();

  constructor(private options: TaskQueueOptions) {}

  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = this.runWithRetry(task, this.options.maxRetries).finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.inFlight.clear();
  }

  private async runWithRetry<T>(task: () => Promise<T>, retriesRemaining: number): Promise<T> {
    try {
      return await this.runWithTimeout(task);
    } catch (error) {
      if (retriesRemaining <= 0) {
        throw error;
      }
      return this.runWithRetry(task, retriesRemaining - 1);
    }
  }

  private async runWithTimeout<T>(task: () => Promise<T>): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      return await Promise.race([
        task(),
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Task timed out after ${this.options.timeoutMs}ms`));
          }, this.options.timeoutMs);
        })
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
