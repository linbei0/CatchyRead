import { DEFAULT_SETTINGS } from '@/shared/default-settings';
import type { AppSettings, CodeStrategy, ReadingMode, SpeechEngine, UiPreferences } from '@/shared/types';

export interface ProviderFormState {
  providerId: string;
  enabled: boolean;
  baseUrl: string;
  modelOrVoice: string;
  apiKeyStoredLocally: string;
  headersText: string;
  temperature?: number;
  voiceId: string;
  allowInsecureTransport: boolean;
  allowPrivateNetwork: boolean;
}

export interface SettingsFormState {
  llm: ProviderFormState;
  tts: ProviderFormState;
  playback: {
    rate: string;
    mode: ReadingMode;
    codeStrategy: CodeStrategy;
    speechEngine: SpeechEngine;
  };
}

function stringifyHeaders(headers?: Record<string, string>): string {
  return JSON.stringify(headers || {}, null, 2);
}

function parseHeaders(text: string): Record<string, string> {
  if (!text.trim()) {
    return {};
  }
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('请求头必须是 JSON 对象。');
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
}

export function buildSettingsFormState(settings: AppSettings): SettingsFormState {
  return {
    llm: {
      providerId: settings.providers.llm.providerId,
      enabled: settings.providers.llm.enabled,
      baseUrl: settings.providers.llm.baseUrl,
      modelOrVoice: settings.providers.llm.modelOrVoice,
      apiKeyStoredLocally: settings.providers.llm.apiKeyStoredLocally,
      headersText: stringifyHeaders(settings.providers.llm.headers),
      temperature: settings.providers.llm.temperature ?? DEFAULT_SETTINGS.providers.llm.temperature,
      voiceId: settings.providers.llm.voiceId || '',
      allowInsecureTransport: settings.providers.llm.allowInsecureTransport ?? false,
      allowPrivateNetwork: settings.providers.llm.allowPrivateNetwork ?? false
    },
    tts: {
      providerId: settings.providers.tts.providerId,
      enabled: settings.providers.tts.enabled,
      baseUrl: settings.providers.tts.baseUrl,
      modelOrVoice: settings.providers.tts.modelOrVoice,
      apiKeyStoredLocally: settings.providers.tts.apiKeyStoredLocally,
      headersText: stringifyHeaders(settings.providers.tts.headers),
      temperature: settings.providers.tts.temperature,
      voiceId: settings.providers.tts.voiceId || 'alloy',
      allowInsecureTransport: settings.providers.tts.allowInsecureTransport ?? false,
      allowPrivateNetwork: settings.providers.tts.allowPrivateNetwork ?? false
    },
    playback: {
      rate: String(settings.playback.rate),
      mode: settings.playback.mode,
      codeStrategy: settings.playback.codeStrategy,
      speechEngine: settings.playback.speechEngine
    }
  };
}

export function readSettingsFromForm(form: HTMLFormElement, ui: UiPreferences): AppSettings {
  const data = new FormData(form);

  return {
    providers: {
      llm: {
        ...DEFAULT_SETTINGS.providers.llm,
        enabled: data.get('llm.enabled') === 'on',
        baseUrl: String(data.get('llm.baseUrl') || ''),
        modelOrVoice: String(data.get('llm.modelOrVoice') || ''),
        apiKeyStoredLocally: String(data.get('llm.apiKeyStoredLocally') || ''),
        headers: parseHeaders(String(data.get('llm.headers') || '{}')),
        temperature: Number(data.get('llm.temperature') || DEFAULT_SETTINGS.providers.llm.temperature || 0.3),
        allowInsecureTransport: data.get('llm.allowInsecureTransport') === 'on',
        allowPrivateNetwork: data.get('llm.allowPrivateNetwork') === 'on'
      },
      tts: {
        ...DEFAULT_SETTINGS.providers.tts,
        providerId: String(data.get('tts.providerId') || DEFAULT_SETTINGS.providers.tts.providerId),
        enabled: data.get('tts.enabled') === 'on',
        baseUrl: String(data.get('tts.baseUrl') || ''),
        modelOrVoice: String(data.get('tts.modelOrVoice') || ''),
        apiKeyStoredLocally: String(data.get('tts.apiKeyStoredLocally') || ''),
        headers: parseHeaders(String(data.get('tts.headers') || '{}')),
        voiceId: String(data.get('tts.voiceId') || 'alloy'),
        allowInsecureTransport: data.get('tts.allowInsecureTransport') === 'on',
        allowPrivateNetwork: data.get('tts.allowPrivateNetwork') === 'on'
      }
    },
    playback: {
      rate: Number(data.get('playback.rate') || 1),
      mode: String(data.get('playback.mode') || 'smart') as ReadingMode,
      codeStrategy: String(data.get('playback.codeStrategy') || 'summary') as CodeStrategy,
      speechEngine: String(data.get('playback.speechEngine') || 'browser') as SpeechEngine
    },
    ui
  };
}
