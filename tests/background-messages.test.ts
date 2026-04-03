import { describe, expect, test, vi } from 'vitest';

import type { RuntimeMessage } from '@/lib/shared/messages';
import { handleRuntimeMessage } from '@/background/handlers';

describe('handleRuntimeMessage', () => {
  test('收到打开设置页消息时，委托给 runtime.openOptionsPage', async () => {
    const openOptionsPage = vi.fn().mockResolvedValue(undefined);

    await handleRuntimeMessage(
      { type: 'catchyread/open-options' } as RuntimeMessage,
      {
        openOptionsPage,
        loadSettings: vi.fn(),
        saveSettings: vi.fn(),
        fetchRewriteSegments: vi.fn(),
        fetchRemoteTtsAudio: vi.fn(),
        testProviderConnectivity: vi.fn(),
        updateUiPreferences: vi.fn()
      }
    );

    expect(openOptionsPage).toHaveBeenCalledTimes(1);
  });

  test('收到提供商连通性测试消息时，返回探测结果', async () => {
    const testProviderConnectivity = vi.fn().mockResolvedValue({
      ok: true,
      providerKind: 'llm',
      message: '连通成功'
    });

    const result = await handleRuntimeMessage(
      { type: 'catchyread/test-provider', payload: { providerKind: 'llm' } } as RuntimeMessage,
      {
        openOptionsPage: vi.fn(),
        loadSettings: vi.fn(),
        saveSettings: vi.fn(),
        fetchRewriteSegments: vi.fn(),
        fetchRemoteTtsAudio: vi.fn(),
        testProviderConnectivity,
        updateUiPreferences: vi.fn()
      }
    );

    expect(testProviderConnectivity).toHaveBeenCalledWith('llm');
    expect(result).toEqual({
      ok: true,
      providerKind: 'llm',
      message: '连通成功'
    });
  });

  test('收到保存 UI 状态消息时，只更新 UI 偏好', async () => {
    const updateUiPreferences = vi.fn().mockResolvedValue({
      collapsed: true,
      x: 10,
      y: 20
    });

    const result = await handleRuntimeMessage(
      { type: 'catchyread/save-ui-state', payload: { collapsed: true } } as RuntimeMessage,
      {
        openOptionsPage: vi.fn(),
        loadSettings: vi.fn(),
        saveSettings: vi.fn(),
        fetchRewriteSegments: vi.fn(),
        fetchRemoteTtsAudio: vi.fn(),
        testProviderConnectivity: vi.fn(),
        updateUiPreferences
      }
    );

    expect(updateUiPreferences).toHaveBeenCalledWith({ collapsed: true });
    expect(result).toEqual({
      ui: {
        collapsed: true,
        x: 10,
        y: 20
      }
    });
  });
});
