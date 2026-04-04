import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';

import type { AppSettings } from '@/shared/types';
import {
  buildSettingsFormState,
  readSettingsFromForm,
  type SettingsFormState
} from '@/domain/options/settings-form-state';

const settings: AppSettings = {
  providers: {
    llm: {
      providerId: 'openai-compatible-llm',
      kind: 'llm',
      enabled: true,
      baseUrl: 'https://api.example.com/v1',
      modelOrVoice: 'gpt-x',
      apiKeyStoredLocally: 'secret',
      headers: { 'X-Test': '1' },
      temperature: 0.5,
      allowInsecureTransport: false,
      allowPrivateNetwork: true
    },
    tts: {
      providerId: 'qwen-dashscope-tts',
      kind: 'tts',
      enabled: true,
      baseUrl: 'https://tts.example.com/v1',
      modelOrVoice: 'voice-model',
      apiKeyStoredLocally: 'audio-key',
      headers: { 'X-TTS': 'ok' },
      voiceId: 'Cherry',
      allowInsecureTransport: true,
      allowPrivateNetwork: false
    }
  },
  playback: {
    rate: 1.2,
    mode: 'original',
    codeStrategy: 'full',
    speechEngine: 'remote'
  },
  ui: {
    collapsed: true,
    x: 12,
    y: 34
  }
};

describe('settings-form-state', () => {
  test('从设置构建表单状态时保留兼容字段', () => {
    const state = buildSettingsFormState(settings);

    expect(state.tts.providerId).toBe('qwen-dashscope-tts');
    expect(state.tts.headersText).toContain('"X-TTS"');
    expect(state.llm.temperature).toBe(0.5);
    expect(state.playback.mode).toBe('original');
  });

  test('从表单读取时恢复 AppSettings 并保留 UI 偏好', () => {
    const dom = new JSDOM(`
      <form id="settings-form">
        <input name="llm.enabled" type="checkbox" checked />
        <input name="llm.baseUrl" value="https://api.example.com/v1" />
        <input name="llm.modelOrVoice" value="gpt-x" />
        <input name="llm.apiKeyStoredLocally" value="secret" />
        <textarea name="llm.headers">{"X-Test":"1"}</textarea>
        <input name="llm.temperature" value="0.5" />
        <input name="llm.allowPrivateNetwork" type="checkbox" checked />

        <input name="tts.enabled" type="checkbox" checked />
        <select name="tts.providerId"><option value="qwen-dashscope-tts" selected>Qwen</option></select>
        <input name="tts.baseUrl" value="https://tts.example.com/v1" />
        <input name="tts.modelOrVoice" value="voice-model" />
        <input name="tts.apiKeyStoredLocally" value="audio-key" />
        <textarea name="tts.headers">{"X-TTS":"ok"}</textarea>
        <input name="tts.voiceId" value="Cherry" />
        <input name="tts.allowInsecureTransport" type="checkbox" checked />

        <select name="playback.mode"><option value="original" selected>原文</option></select>
        <select name="playback.codeStrategy"><option value="full" selected>全文</option></select>
        <select name="playback.speechEngine"><option value="remote" selected>远端</option></select>
        <input name="playback.rate" value="1.2" />
      </form>
    `);

    const form = dom.window.document.querySelector('form');
    if (!(form instanceof dom.window.HTMLFormElement)) {
      throw new Error('测试表单创建失败。');
    }

    const restored = readSettingsFromForm(form, settings.ui);

    expect(restored.providers.llm.headers).toEqual({ 'X-Test': '1' });
    expect(restored.providers.tts.voiceId).toBe('Cherry');
    expect(restored.playback.speechEngine).toBe('remote');
    expect(restored.ui).toEqual(settings.ui);
  });

  test('表单状态支持直接渲染默认播放偏好', () => {
    const formState: SettingsFormState = buildSettingsFormState(settings);

    expect(formState.playback.rate).toBe('1.2');
    expect(formState.playback.codeStrategy).toBe('full');
    expect(formState.llm.allowPrivateNetwork).toBe(true);
  });

  test('支持读取与回填跳过代码策略', () => {
    const skipSettings: AppSettings = {
      ...settings,
      playback: {
        ...settings.playback,
        codeStrategy: 'skip'
      }
    };
    const formState = buildSettingsFormState(skipSettings);

    expect(formState.playback.codeStrategy).toBe('skip');

    const dom = new JSDOM(`
      <form id="settings-form">
        <input name="llm.baseUrl" value="" />
        <input name="llm.modelOrVoice" value="" />
        <input name="llm.apiKeyStoredLocally" value="" />
        <textarea name="llm.headers">{}</textarea>
        <input name="llm.temperature" value="0.3" />

        <select name="tts.providerId"><option value="qwen-dashscope-tts" selected>Qwen</option></select>
        <input name="tts.baseUrl" value="" />
        <input name="tts.modelOrVoice" value="" />
        <input name="tts.apiKeyStoredLocally" value="" />
        <textarea name="tts.headers">{}</textarea>
        <input name="tts.voiceId" value="Cherry" />

        <select name="playback.mode"><option value="original" selected>原文</option></select>
        <select name="playback.codeStrategy"><option value="skip" selected>跳过代码</option></select>
        <select name="playback.speechEngine"><option value="browser" selected>浏览器</option></select>
        <input name="playback.rate" value="1" />
      </form>
    `);
    const form = dom.window.document.querySelector('form');
    if (!(form instanceof dom.window.HTMLFormElement)) {
      throw new Error('测试表单创建失败。');
    }

    const restored = readSettingsFromForm(form, settings.ui);
    expect(restored.playback.codeStrategy).toBe('skip');
  });
});
