import { describe, expect, test } from 'vitest';

import { readErrorMessageOnce } from '@/lib/http/response-body';

describe('readErrorMessageOnce', () => {
  test('当 json 解析失败时，不会再次读取已消费的 body 流', async () => {
    const response = new Response('plain text error', {
      status: 400,
      headers: {
        'content-type': 'text/plain'
      }
    });

    await expect(readErrorMessageOnce(response)).resolves.toContain('plain text error');
  });
});
