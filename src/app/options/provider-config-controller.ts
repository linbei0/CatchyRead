import browser from 'webextension-polyfill';

import { buildRequiredOriginsForProvider } from '@/lib/permissions/provider-host-access';
import { applyTtsProviderPreset } from '@/options/provider-config';
import { buildSuccessNotice, mapErrorToNotice } from '@/lib/ui/feedback';
import type { AppSettings, ProviderConfig, ProviderTestResult, UserNotice } from '@/shared/types';
import { OptionsMessageGateway } from '@/infra/runtime/options-message-gateway';

export class ProviderConfigController {
  constructor(private readonly gateway: OptionsMessageGateway) {}

  private async ensureProviderOriginsGranted(provider: ProviderConfig): Promise<void> {
    const origins = buildRequiredOriginsForProvider(provider);
    const alreadyGranted = await browser.permissions.contains({ origins });
    if (alreadyGranted) {
      return;
    }
    const granted = await browser.permissions.request({ origins });
    if (!granted) {
      throw new Error(`未授予 ${provider.kind.toUpperCase()} Provider 所需的域名访问权限。`);
    }
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    if (settings.providers.llm.enabled) {
      await this.ensureProviderOriginsGranted(settings.providers.llm);
    }
    if (settings.providers.tts.enabled) {
      await this.ensureProviderOriginsGranted(settings.providers.tts);
    }
    return this.gateway.saveSettings(settings);
  }

  async testProvider(providerKind: 'llm' | 'tts', settings: AppSettings): Promise<ProviderTestResult> {
    await this.ensureProviderOriginsGranted(providerKind === 'llm' ? settings.providers.llm : settings.providers.tts);
    await this.saveSettings(settings);
    return this.gateway.testProvider(providerKind);
  }

  applyTtsPreset(settings: AppSettings, providerId: string): AppSettings {
    return {
      ...settings,
      providers: {
        ...settings.providers,
        tts: applyTtsProviderPreset(providerId, settings.providers.tts)
      }
    };
  }

  buildSaveSuccessNotice(): UserNotice {
    return buildSuccessNotice('设置已保存', '新的配置已经写入本地扩展存储。', '现在可以去测试连接，或直接回到播放器开始收听。');
  }

  mapError(error: unknown, action: 'save-settings' | 'test-provider' | 'preview-sample'): UserNotice {
    return mapErrorToNotice(error, { surface: 'options', action });
  }
}
