import { describe, expect, test, vi } from 'vitest';

import { ensureTabReadyAndToggle } from '@/background/activation';

describe('ensureTabReadyAndToggle', () => {
  test('发送 toggle 失败时会注入内容脚本并重试', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('Receiving end does not exist'))
      .mockResolvedValueOnce(undefined);
    const executeScript = vi.fn().mockResolvedValue(undefined);

    await ensureTabReadyAndToggle(7, {
      sendMessage,
      executeScript
    });

    expect(executeScript).toHaveBeenCalledWith(7);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
