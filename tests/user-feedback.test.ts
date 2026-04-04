import { describe, expect, test } from 'vitest';

import { mapErrorToNotice } from '@/lib/ui/feedback';

describe('mapErrorToNotice', () => {
  test('把权限错误映射为可恢复提示', () => {
    const notice = mapErrorToNotice(new Error('未授予 TTS Provider 所需的域名访问权限。'), {
      surface: 'options',
      action: 'test-provider'
    });

    expect(notice.category).toBe('permission-denied');
    expect(notice.title).toBe('需要访问权限');
    expect(notice.recommendedAction).toContain('授权');
    expect(notice.debugDetails).toContain('未授予');
  });

  test('把空音频响应映射为返回格式异常', () => {
    const notice = mapErrorToNotice(new Error('远端音频响应既没有 mediaUrl，也没有 base64Audio。'), {
      surface: 'player',
      action: 'playback'
    });

    expect(notice.category).toBe('invalid-response');
    expect(notice.title).toBe('返回内容不完整');
    expect(notice.message).toContain('音频');
  });

  test('把底层网络失败映射为网络超时或失败', () => {
    const notice = mapErrorToNotice(new Error('Failed to fetch'), {
      surface: 'options',
      action: 'test-provider'
    });

    expect(notice.category).toBe('network');
    expect(notice.title).toBe('网络连接失败');
    expect(notice.canRetry).toBe(true);
  });

  test('把智能整理超时映射为专用提示', () => {
    const notice = mapErrorToNotice(new Error('Task timed out after 45000ms'), {
      surface: 'player',
      action: 'playback'
    });

    expect(notice.category).toBe('rewrite-timeout');
    expect(notice.title).toBe('智能整理超时');
    expect(notice.recommendedAction).toContain('模型延迟');
  });
});
