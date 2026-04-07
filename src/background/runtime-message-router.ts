import type {
  AppSettings,
  ProviderConfig,
  ProviderTestResult,
  RemoteAudioPayload,
  SitePlaybackPreferences,
  SmartScriptSegment,
  UiPreferences
} from '@/shared/types';
import type { RuntimeMessage } from '@/shared/messages';

export interface SettingsRepository {
  load(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<AppSettings>;
}

export interface UiPreferencesRepository {
  update(partial: Partial<UiPreferences>): Promise<UiPreferences>;
}

export interface SitePlaybackPreferencesRepository {
  load(url: string): Promise<SitePlaybackPreferences | null>;
  save(url: string, playback: SitePlaybackPreferences): Promise<SitePlaybackPreferences>;
}

export interface ProviderGateway {
  rewrite(provider: ProviderConfig, message: Extract<RuntimeMessage, { type: 'catchyread/rewrite' }>['payload']): Promise<SmartScriptSegment[]>;
  cancelRewrite(requestId: string): Promise<void>;
  synthesizeRemote(provider: ProviderConfig, message: Extract<RuntimeMessage, { type: 'catchyread/synthesize-remote' }>['payload']): Promise<RemoteAudioPayload>;
  previewTtsSample(provider: ProviderConfig, text: string): Promise<RemoteAudioPayload>;
  testConnectivity(providerKind: 'llm' | 'tts'): Promise<ProviderTestResult>;
}

export interface RuntimeRouterDependencies {
  openOptionsPage: () => Promise<void>;
  settingsRepository: SettingsRepository;
  uiPreferencesRepository: UiPreferencesRepository;
  sitePlaybackPreferencesRepository: SitePlaybackPreferencesRepository;
  providerGateway: ProviderGateway;
}

export function createRuntimeMessageRouter(deps: RuntimeRouterDependencies) {
  return async (message: RuntimeMessage): Promise<unknown> => {
    switch (message.type) {
      case 'catchyread/open-options':
        await deps.openOptionsPage();
        return { ok: true };
      case 'catchyread/get-settings':
        return {
          settings: await deps.settingsRepository.load()
        };
      case 'catchyread/save-settings':
        return {
          settings: await deps.settingsRepository.save(message.payload)
        };
      case 'catchyread/save-ui-state':
        return {
          ui: await deps.uiPreferencesRepository.update(message.payload)
        };
      case 'catchyread/get-site-playback-preferences':
        return {
          playback: await deps.sitePlaybackPreferencesRepository.load(message.payload.url)
        };
      case 'catchyread/save-site-playback-preferences':
        return {
          playback: await deps.sitePlaybackPreferencesRepository.save(message.payload.url, message.payload.playback)
        };
      case 'catchyread/test-provider':
        return deps.providerGateway.testConnectivity(message.payload.providerKind);
      case 'catchyread/preview-tts-sample': {
        const settings = await deps.settingsRepository.load();
        return {
          audio: await deps.providerGateway.previewTtsSample(settings.providers.tts, message.payload.text)
        };
      }
      case 'catchyread/rewrite': {
        const settings = await deps.settingsRepository.load();
        return {
          segments: await deps.providerGateway.rewrite(settings.providers.llm, message.payload)
        };
      }
      case 'catchyread/cancel-rewrite':
        await deps.providerGateway.cancelRewrite(message.payload.requestId);
        return { ok: true };
      case 'catchyread/synthesize-remote': {
        const settings = await deps.settingsRepository.load();
        return {
          audio: await deps.providerGateway.synthesizeRemote(settings.providers.tts, message.payload)
        };
      }
      default:
        return undefined;
    }
  };
}
