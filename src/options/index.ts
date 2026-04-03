import browser from 'webextension-polyfill';

import { buildRequiredOriginsForProvider } from '@/lib/permissions/provider-host-access';
import type { AppSettings, ProviderConfig } from '@/lib/shared/types';
import { listTtsProviderAdapters } from '@/lib/tts/registry';
import { DEFAULT_SETTINGS } from '@/lib/storage/settings';
import { getApiKeyFieldType } from '@/options/uiState';

const form = document.querySelector<HTMLFormElement>('#settings-form');
const saveButton = document.querySelector<HTMLButtonElement>('#save-button');
const resetButton = document.querySelector<HTMLButtonElement>('#reset-button');
const statusElement = document.querySelector<HTMLDivElement>('#status');

if (!form || !saveButton || !resetButton || !statusElement) {
  throw new Error('设置页初始化失败：缺少必要的 DOM 节点。');
}

const settingsForm = form;
const statusNode = statusElement;
let currentSettingsSnapshot: AppSettings = DEFAULT_SETTINGS;
const ttsProviderOptions = listTtsProviderAdapters();
const apiKeyVisibility: Record<'llm' | 'tts', boolean> = {
  llm: false,
  tts: false
};

function renderProviderFields(title: string, provider: ProviderConfig, prefix: 'llm' | 'tts'): string {
  const headersValue = JSON.stringify(provider.headers || {}, null, 2);
  const apiKeyType = getApiKeyFieldType(apiKeyVisibility[prefix]);

  return `
    <section class="panel" style="padding: 18px; border-radius: 18px; background: rgba(2, 6, 23, 0.42); border: 1px solid rgba(148, 163, 184, 0.12);">
      <h3 style="margin-top: 0;">${title}</h3>
      <label>
        启用
        <select name="${prefix}.enabled">
          <option value="true" ${provider.enabled ? 'selected' : ''}>启用</option>
          <option value="false" ${provider.enabled ? '' : 'selected'}>禁用</option>
        </select>
      </label>
      <label>
        ${prefix === 'tts' ? 'TTS Provider' : 'Base URL'}
        ${
          prefix === 'tts'
            ? `<select name="${prefix}.providerId">
                 ${ttsProviderOptions
                   .map(
                     (item) =>
                       `<option value="${item.id}" ${provider.providerId === item.id ? 'selected' : ''}>${item.label}</option>`
                   )
                   .join('')}
               </select>`
            : `<input name="${prefix}.baseUrl" value="${provider.baseUrl}" />`
        }
      </label>
      ${
        prefix === 'tts'
          ? `<label>
               Base URL
               <input name="${prefix}.baseUrl" value="${provider.baseUrl}" />
             </label>`
          : ''
      }
      <label>
        模型名
        <input name="${prefix}.modelOrVoice" value="${provider.modelOrVoice}" />
      </label>
      <label>
        API Key
        <input name="${prefix}.apiKeyStoredLocally" value="${provider.apiKeyStoredLocally}" type="${apiKeyType}" autocomplete="off" spellcheck="false" />
      </label>
      <label style="display:flex; align-items:center; gap:10px; color:#cbd5e1;">
        <input data-toggle-api-key="${prefix}" type="checkbox" ${apiKeyVisibility[prefix] ? 'checked' : ''} style="width:auto;" />
        显示 API Key
      </label>
      <label>
        自定义请求头（JSON）
        <textarea name="${prefix}.headers">${headersValue}</textarea>
      </label>
      ${
        prefix === 'llm'
          ? `<label>Temperature
               <input name="${prefix}.temperature" type="number" min="0" max="1" step="0.1" value="${provider.temperature ?? 0.3}" />
             </label>`
          : `<label>默认音色 / voice
               <input name="${prefix}.voiceId" value="${provider.voiceId || 'alloy'}" />
             </label>`
      }
      <label style="display:flex; align-items:center; gap:10px; color:#cbd5e1;">
        <input name="${prefix}.allowInsecureTransport" type="checkbox" ${provider.allowInsecureTransport ? 'checked' : ''} style="width:auto;" />
        允许 HTTP 端点（仅开发调试）
      </label>
      <label style="display:flex; align-items:center; gap:10px; color:#cbd5e1;">
        <input name="${prefix}.allowPrivateNetwork" type="checkbox" ${provider.allowPrivateNetwork ? 'checked' : ''} style="width:auto;" />
        允许本地 / 私网端点（仅开发调试）
      </label>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
        <button class="secondary test-provider-button" data-provider-kind="${prefix}" type="button">测试${prefix === 'llm' ? 'LLM' : 'TTS'}连接</button>
      </div>
    </section>
  `;
}

function render(settings: AppSettings): void {
  settingsForm.innerHTML = `
    ${renderProviderFields('LLM 轻改写提供商', settings.providers.llm, 'llm')}
    ${renderProviderFields('TTS 语音提供商', settings.providers.tts, 'tts')}
    <section class="panel" style="padding: 18px; border-radius: 18px; background: rgba(2, 6, 23, 0.42); border: 1px solid rgba(148, 163, 184, 0.12);">
      <h3 style="margin-top: 0;">默认播放偏好</h3>
      <label>
        默认模式
        <select name="playback.mode">
          <option value="smart" ${settings.playback.mode === 'smart' ? 'selected' : ''}>智能模式</option>
          <option value="original" ${settings.playback.mode === 'original' ? 'selected' : ''}>原文模式</option>
        </select>
      </label>
      <label>
        默认代码策略
        <select name="playback.codeStrategy">
          <option value="summary" ${settings.playback.codeStrategy === 'summary' ? 'selected' : ''}>摘要</option>
          <option value="full" ${settings.playback.codeStrategy === 'full' ? 'selected' : ''}>原文</option>
        </select>
      </label>
      <label>
        默认语音引擎
        <select name="playback.speechEngine">
          <option value="browser" ${settings.playback.speechEngine === 'browser' ? 'selected' : ''}>浏览器 / 系统语音</option>
          <option value="remote" ${settings.playback.speechEngine === 'remote' ? 'selected' : ''}>远端 TTS</option>
        </select>
      </label>
      <label>
        默认倍速
        <input name="playback.rate" type="number" min="0.5" max="2" step="0.1" value="${settings.playback.rate}" />
      </label>
    </section>
  `;
}

function showStatus(message: string, isError = false): void {
  statusNode.textContent = message;
  statusNode.classList.toggle('error', isError);
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

function readSettingsFromForm(): AppSettings {
  const data = new FormData(settingsForm);
  return {
    providers: {
      llm: {
        ...DEFAULT_SETTINGS.providers.llm,
        enabled: data.get('llm.enabled') === 'true',
        baseUrl: String(data.get('llm.baseUrl') || ''),
        modelOrVoice: String(data.get('llm.modelOrVoice') || ''),
        apiKeyStoredLocally: String(data.get('llm.apiKeyStoredLocally') || ''),
        headers: parseHeaders(String(data.get('llm.headers') || '{}')),
        temperature: Number(data.get('llm.temperature') || 0.3),
        allowInsecureTransport: data.get('llm.allowInsecureTransport') === 'on',
        allowPrivateNetwork: data.get('llm.allowPrivateNetwork') === 'on'
      },
      tts: {
        ...DEFAULT_SETTINGS.providers.tts,
        providerId: String(data.get('tts.providerId') || DEFAULT_SETTINGS.providers.tts.providerId),
        enabled: data.get('tts.enabled') === 'true',
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
      mode: String(data.get('playback.mode') || 'smart') as AppSettings['playback']['mode'],
      codeStrategy: String(data.get('playback.codeStrategy') || 'summary') as AppSettings['playback']['codeStrategy'],
      speechEngine: String(data.get('playback.speechEngine') || 'browser') as AppSettings['playback']['speechEngine']
    },
    ui: currentSettingsSnapshot.ui
  };
}

async function ensureProviderOriginsGranted(provider: ProviderConfig): Promise<void> {
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

async function loadAndRender(): Promise<void> {
  const result = (await browser.runtime.sendMessage({ type: 'catchyread/get-settings' })) as { settings: AppSettings };
  currentSettingsSnapshot = result.settings;
  render(result.settings);
}

async function saveCurrentSettings(): Promise<AppSettings> {
  const settings = readSettingsFromForm();
  if (settings.providers.llm.enabled) {
    await ensureProviderOriginsGranted(settings.providers.llm);
  }
  if (settings.providers.tts.enabled) {
    await ensureProviderOriginsGranted(settings.providers.tts);
  }
  const result = (await browser.runtime.sendMessage({
    type: 'catchyread/save-settings',
    payload: settings
  })) as { settings: AppSettings };
  currentSettingsSnapshot = result.settings;
  return result.settings;
}

async function testProvider(providerKind: 'llm' | 'tts'): Promise<void> {
  try {
    showStatus(`正在测试 ${providerKind.toUpperCase()} 连接…`);
    const settings = readSettingsFromForm();
    await ensureProviderOriginsGranted(providerKind === 'llm' ? settings.providers.llm : settings.providers.tts);
    await saveCurrentSettings();
    const result = (await browser.runtime.sendMessage({
      type: 'catchyread/test-provider',
      payload: { providerKind }
    })) as {
      ok: boolean;
      providerKind: 'llm' | 'tts';
      message: string;
    };
    showStatus(result.message, !result.ok);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '连接测试失败。', true);
  }
}

saveButton.addEventListener('click', async () => {
  try {
    await saveCurrentSettings();
    showStatus('设置已保存到本地扩展存储。');
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '保存失败。', true);
  }
});

resetButton.addEventListener('click', () => {
  render(DEFAULT_SETTINGS);
  showStatus('已恢复默认值，点击“保存设置”即可落盘。');
});

settingsForm.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const providerKind = target.dataset.toggleApiKey;
  if (providerKind === 'llm' || providerKind === 'tts') {
    apiKeyVisibility[providerKind] = target.checked;
    render(readSettingsFromForm());
    return;
  }

  if (target instanceof HTMLSelectElement && target.name === 'tts.providerId') {
    const settings = readSettingsFromForm();
    if (target.value === 'qwen-dashscope-tts') {
      settings.providers.tts.baseUrl = 'https://dashscope.aliyuncs.com/api/v1';
      settings.providers.tts.modelOrVoice = 'qwen3-tts-instruct-flash';
      settings.providers.tts.voiceId = 'Cherry';
    } else if (target.value === 'openai-compatible-tts') {
      settings.providers.tts.baseUrl = 'https://api.openai.com/v1';
      settings.providers.tts.modelOrVoice = 'gpt-4o-mini-tts';
      settings.providers.tts.voiceId = 'alloy';
    }
    render(settings);
  }
});

settingsForm.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const button = target.closest<HTMLButtonElement>('.test-provider-button');
  if (!button) {
    return;
  }
  const providerKind = button.dataset.providerKind;
  if (providerKind === 'llm' || providerKind === 'tts') {
    void testProvider(providerKind);
  }
});

void loadAndRender();
