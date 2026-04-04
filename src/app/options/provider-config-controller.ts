import browser from 'webextension-polyfill';

import { buildRequiredOriginsForProvider } from '@/lib/permissions/provider-host-access';
import { applyTtsProviderPreset } from '@/options/provider-config';
import { buildSuccessNotice, mapErrorToNotice } from '@/lib/ui/feedback';
import type { AppSettings, ProviderConfig, ProviderTestResult, UserNotice } from '@/shared/types';
import { OptionsMessageGateway } from '@/infra/runtime/options-message-gateway';

type PermissionsApi = Pick<typeof browser.permissions, 'request'>;

export class ProviderConfigController {
  constructor(
    private readonly gateway: OptionsMessageGateway,
    private readonly permissionsApi: PermissionsApi = browser.permissions
  ) {}

  private async ensureProviderOriginsGranted(providers: ProviderConfig[]): Promise<void> {
    const origins = Array.from(new Set(providers.flatMap((provider) => buildRequiredOriginsForProvider(provider))));
    if (origins.length === 0) {
      return;
    }

    const granted = await this.permissionsApi.request({ origins });
    if (!granted) {
      const providerKinds = Array.from(new Set(providers.map((provider) => provider.kind.toUpperCase()))).join(' / ');
      throw new Error(`未授予 ${providerKinds} Provider 所需的域名访问权限。`);
    }
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    await this.ensureProviderOriginsGranted(
      [settings.providers.llm, settings.providers.tts].filter((provider) => provider.enabled)
    );
    return this.gateway.saveSettings(settings);
  }

  async testProvider(providerKind: 'llm' | 'tts', settings: AppSettings): Promise<ProviderTestResult> {
    await this.ensureProviderOriginsGranted([providerKind === 'llm' ? settings.providers.llm : settings.providers.tts]);
    await this.gateway.saveSettings(settings);
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
