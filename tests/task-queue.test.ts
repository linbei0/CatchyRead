import { describe, expect, test, vi } from 'vitest';

import { TaskQueue } from '@/lib/request/task-queue';

describe('TaskQueue', () => {
  test('相同 key 的任务会复用同一个 promise', async () => {
    const queue = new TaskQueue({ timeoutMs: 1000, maxRetries: 0 });
    const worker = vi.fn().mockResolvedValue('ok');

    const result = await Promise.all([
      queue.enqueue('same', worker),
      queue.enqueue('same', worker)
    ]);

    expect(worker).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['ok', 'ok']);
  });

  test('失败任务会按配置重试', async () => {
    const queue = new TaskQueue({ timeoutMs: 1000, maxRetries: 1 });
    const worker = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');

    await expect(queue.enqueue('retry', worker)).resolves.toBe('ok');
    expect(worker).toHaveBeenCalledTimes(2);
  });

  test('取消任务时会中止对应 signal', async () => {
    const queue = new TaskQueue({ timeoutMs: 1000, maxRetries: 0 });
    const worker = vi.fn(
      (signal: AbortSignal) =>
        new Promise<string>((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
          setTimeout(() => resolve('late'), 50);
        })
    );

    const promise = queue.enqueue('cancel-me', worker);
    queue.cancel('cancel-me', new Error('cancelled'));

    await expect(promise).rejects.toThrow('cancelled');
    expect(worker).toHaveBeenCalledTimes(1);
  });
});
