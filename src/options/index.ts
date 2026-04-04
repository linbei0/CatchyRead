import browser from 'webextension-polyfill';

import { buildRequiredOriginsForProvider } from '@/lib/permissions/provider-host-access';
import type {
  AppSettings,
  ProviderConfig,
  ProviderTestResult,
  RemoteAudioPayload,
  UserNotice
} from '@/lib/shared/types';
import type { ProviderTestMessageResult, TtsPreviewMessageResult } from '@/lib/shared/messages';
import { listTtsProviderAdapters } from '@/lib/tts/registry';
import { DEFAULT_SETTINGS } from '@/lib/storage/settings';
import { buildSuccessNotice, mapErrorToNotice } from '@/lib/ui/feedback';
import { renderTtsQuickStartCard } from '@/options/markup';
import { applyTtsProviderPreset } from '@/options/provider-config';
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
const ttsProviderOptions = listTtsProviderAdapters();
const apiKeyVisibility: Record<'llm' | 'tts', boolean> = {
  llm: false,
  tts: false
};
const providerResults: Partial<Record<'llm' | 'tts', ProviderTestResult>> = {};
let currentSettingsSnapshot: AppSettings = DEFAULT_SETTINGS;
let previewAudio: HTMLAudioElement | null = null;
let previewObjectUrl: string | null = null;
let previewReady = false;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderNotice(notice: UserNotice): void {
  const tone =
    notice.category === 'success'
      ? 'success'
      : ['permission-denied', 'network', 'provider-rejected', 'invalid-response', 'audio-playback', 'browser-unsupported', 'unknown'].includes(
            notice.category
          )
        ? 'danger'
        : 'default';

  statusNode.dataset.tone = tone;
  statusNode.innerHTML = `
    <div class="notice-title">${escapeHtml(notice.title)}</div>
    <div class="notice-body">${escapeHtml(notice.message)}</div>
    <div class="notice-action">${escapeHtml(notice.recommendedAction)}</div>
    ${
      notice.debugDetails
        ? `<details><summary>查看调试信息</summary><div>${escapeHtml(notice.debugDetails)}</div></details>`
        : ''
    }
  `;
}

function noticeFromProviderResult(result: ProviderTestResult): UserNotice {
  return {
    category: result.category,
    title: result.title,
    message: result.message,
    recommendedAction: result.recommendedAction,
    debugDetails: result.debugDetails,
    canRetry: result.canRetry
  };
}

function renderCheckboxField(name: string, checked: boolean, label: string): string {
  return `
    <label class="toggle-row">
      <input name="${name}" type="checkbox" ${checked ? 'checked' : ''} />
      <span>${label}</span>
    </label>
  `;
}

function renderProviderActions(prefix: 'llm' | 'tts'): string {
  const result = providerResults[prefix];
  const readyForPreview = prefix === 'tts' && previewReady;

  return `
    <div class="provider-actions">
      <button class="primary test-provider-button" data-provider-kind="${prefix}" type="button">
        ${prefix === 'tts' ? '测试声音服务' : '测试智能整理'}
      </button>
      ${
        readyForPreview
          ? '<button class="secondary" id="preview-tts-sample" type="button">试听一下</button>'
          : ''
      }
      ${
        result
          ? `<span class="inline-feedback ${result.ok ? 'ok' : 'error'}">${escapeHtml(result.title)}</span>`
          : ''
      }
    </div>
  `;
}

function renderTtsSection(provider: ProviderConfig): string {
  return `
    <section class="config-section emphasized">
      <div class="section-copy">
        <span class="section-kicker">先让它开口</span>
        <h2>先把语音服务配好。</h2>
      </div>
      <div class="card-grid">
        ${renderTtsQuickStartCard({
          provider,
          providerOptions: ttsProviderOptions.map((item) => ({ id: item.id, label: item.label })),
          apiKeyType: getApiKeyFieldType(apiKeyVisibility.tts),
          apiKeyVisible: apiKeyVisibility.tts,
          result: providerResults.tts,
          previewReady
        })}
      </div>
    </section>
  `;
}

function renderLlmSection(provider: ProviderConfig): string {
  const apiKeyType = getApiKeyFieldType(apiKeyVisibility.llm);

  return `
    <section class="config-section">
      <div class="section-copy">
        <span class="section-kicker">再让它更聪明</span>
        <h2>智能整理只影响讲解方式。</h2>
      </div>
      <div class="card-grid">
        <article class="config-card">
          <div class="card-head">
            <div>
              <h3>LLM 智能整理</h3>
            </div>
            ${renderCheckboxField('llm.enabled', provider.enabled, '启用整理')}
          </div>
          <div class="field-grid">
            <label>
              Base URL
              <input name="llm.baseUrl" value="${escapeHtml(provider.baseUrl)}" />
            </label>
            <label>
              模型
              <input name="llm.modelOrVoice" value="${escapeHtml(provider.modelOrVoice)}" />
            </label>
            <label>
              API Key
              <input name="llm.apiKeyStoredLocally" value="${escapeHtml(provider.apiKeyStoredLocally)}" type="${apiKeyType}" autocomplete="off" spellcheck="false" />
            </label>
          </div>
          <label class="subtle-toggle">
            <input data-toggle-api-key="llm" type="checkbox" ${apiKeyVisibility.llm ? 'checked' : ''} />
            <span class="toggle-label">显示 Key</span>
          </label>
          ${renderProviderActions('llm')}
          <details class="advanced">
            <summary>高级设置</summary>
            <div class="advanced-grid">
              <label>
                Temperature
                <input name="llm.temperature" type="number" min="0" max="1" step="0.1" value="${provider.temperature ?? 0.3}" />
              </label>
              <label>
                自定义请求头（JSON）
                <textarea name="llm.headers">${escapeHtml(JSON.stringify(provider.headers || {}, null, 2))}</textarea>
              </label>
              ${renderCheckboxField('llm.allowInsecureTransport', provider.allowInsecureTransport ?? false, '允许 HTTP（开发）')}
              ${renderCheckboxField('llm.allowPrivateNetwork', provider.allowPrivateNetwork ?? false, '允许私网（开发）')}
            </div>
          </details>
        </article>
        <article class="config-card secondary-card">
          <div class="card-head">
            <div>
              <h3>默认播放偏好</h3>
            </div>
          </div>
          <div class="field-grid">
            <label>
              默认模式
              <select name="playback.mode">
                <option value="smart" ${currentSettingsSnapshot.playback.mode === 'smart' ? 'selected' : ''}>智能整理</option>
                <option value="original" ${currentSettingsSnapshot.playback.mode === 'original' ? 'selected' : ''}>原文直读</option>
              </select>
            </label>
            <label>
              默认语音引擎
              <select name="playback.speechEngine">
                <option value="browser" ${currentSettingsSnapshot.playback.speechEngine === 'browser' ? 'selected' : ''}>浏览器 / 系统语音</option>
                <option value="remote" ${currentSettingsSnapshot.playback.speechEngine === 'remote' ? 'selected' : ''}>远端 TTS</option>
              </select>
            </label>
            <label>
              默认代码策略
              <select name="playback.codeStrategy">
                <option value="summary" ${currentSettingsSnapshot.playback.codeStrategy === 'summary' ? 'selected' : ''}>讲作用</option>
                <option value="full" ${currentSettingsSnapshot.playback.codeStrategy === 'full' ? 'selected' : ''}>念原文</option>
              </select>
            </label>
            <label>
              默认倍速
              <input name="playback.rate" type="number" min="0.5" max="2" step="0.1" value="${currentSettingsSnapshot.playback.rate}" />
            </label>
          </div>
        </article>
      </div>
    </section>
  `;
}

function render(settings: AppSettings): void {
  currentSettingsSnapshot = settings;
  settingsForm.innerHTML = `
    ${renderTtsSection(settings.providers.tts)}
    ${renderLlmSection(settings.providers.llm)}
  `;
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
        enabled: data.get('llm.enabled') === 'on',
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
    render(result.settings);
    renderNotice({
      category: 'info',
      title: '先测试声音服务',
      message: '',
      recommendedAction: ''
    });
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
  render(result.settings);
  return result.settings;
}

async function testProvider(providerKind: 'llm' | 'tts'): Promise<void> {
  try {
    renderNotice({
      category: 'info',
      title: providerKind === 'tts' ? '正在测试声音服务' : '正在测试智能整理',
      message: 'CatchyRead 正在验证服务地址、鉴权和返回格式。',
      recommendedAction: '请稍等，测试完成后我会告诉你下一步该做什么。'
    });

    const settings = readSettingsFromForm();
    await ensureProviderOriginsGranted(providerKind === 'llm' ? settings.providers.llm : settings.providers.tts);
    await saveCurrentSettings();
    const result = (await browser.runtime.sendMessage({
      type: 'catchyread/test-provider',
      payload: { providerKind }
    })) as ProviderTestMessageResult;

    providerResults[providerKind] = result;
    previewReady = providerKind === 'tts' ? result.ok : previewReady;
    render(readSettingsFromForm());
    renderNotice(noticeFromProviderResult(result));
  } catch (error) {
    renderNotice(mapErrorToNotice(error, { surface: 'options', action: 'test-provider' }));
  }
}

function releasePreviewAudio(): void {
  previewAudio?.pause();
  previewAudio = null;
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
}

function payloadToPlayableUrl(payload: RemoteAudioPayload): string {
  if (payload.mediaUrl) {
    return payload.mediaUrl;
  }
  if (!payload.base64Audio) {
    throw new Error('试听音频为空。');
  }
  const binary = atob(payload.base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let offset = 0; offset < binary.length; offset += 1) {
    bytes[offset] = binary.charCodeAt(offset);
  }
  previewObjectUrl = URL.createObjectURL(new Blob([bytes.buffer], { type: payload.mimeType || 'audio/mpeg' }));
  return previewObjectUrl;
}

async function previewTtsSample(): Promise<void> {
  try {
    renderNotice({
      category: 'info',
      title: '正在准备试听',
      message: '我会生成一小段样音，帮你确认现在的声音风格和音色。',
      recommendedAction: '如果这次试听满意，就可以回到播放器正式开始收听。'
    });
    await saveCurrentSettings();
    releasePreviewAudio();
    const result = (await browser.runtime.sendMessage({
      type: 'catchyread/preview-tts-sample',
      payload: {
        text: '你好，这里是 CatchyRead。现在开始为你朗读这一页的重点。'
      }
    })) as TtsPreviewMessageResult;
    const audioUrl = payloadToPlayableUrl(result.audio);
    previewAudio = new Audio(audioUrl);
    await previewAudio.play();
    renderNotice(buildSuccessNotice('试听已开始', '如果这段声音听起来对了，播放器里也会使用同一套配置。', '满意的话，现在就可以回到页面开始收听。'));
  } catch (error) {
    renderNotice(mapErrorToNotice(error, { surface: 'options', action: 'preview-sample' }));
  }
}

saveButton.addEventListener('click', async () => {
  try {
    await saveCurrentSettings();
    renderNotice(buildSuccessNotice('设置已保存', '新的配置已经写入本地扩展存储。', '现在可以去测试连接，或直接回到播放器开始收听。'));
  } catch (error) {
    renderNotice(mapErrorToNotice(error, { surface: 'options', action: 'save-settings' }));
  }
});

resetButton.addEventListener('click', () => {
  providerResults.llm = undefined;
  providerResults.tts = undefined;
  previewReady = false;
  releasePreviewAudio();
  render(DEFAULT_SETTINGS);
  renderNotice({
    category: 'info',
    title: '已恢复默认值',
    message: '表单已经回到初始状态，但还没有写入本地存储。',
    recommendedAction: '确认没问题后点“保存设置”，或重新填写后再测试。'
  });
});

settingsForm.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target instanceof HTMLInputElement) {
    const providerKind = target.dataset.toggleApiKey;
    if (providerKind === 'llm' || providerKind === 'tts') {
      apiKeyVisibility[providerKind] = target.checked;
      render(readSettingsFromForm());
      return;
    }
  }

  if (target instanceof HTMLSelectElement && target.name === 'tts.providerId') {
    const settings = readSettingsFromForm();
    settings.providers.tts = applyTtsProviderPreset(target.value, settings.providers.tts);
    previewReady = false;
    providerResults.tts = undefined;
    render(settings);
  }
});

settingsForm.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const testButton = target.closest<HTMLButtonElement>('.test-provider-button');
  if (testButton) {
    const providerKind = testButton.dataset.providerKind;
    if (providerKind === 'llm' || providerKind === 'tts') {
      void testProvider(providerKind);
    }
    return;
  }

  const previewButton = target.closest<HTMLButtonElement>('#preview-tts-sample');
  if (previewButton) {
    void previewTtsSample();
  }
});

window.addEventListener('beforeunload', () => {
  releasePreviewAudio();
});

void loadAndRender();
