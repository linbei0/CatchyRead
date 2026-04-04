import { renderTtsQuickStartCard } from '@/options/markup';
import { getApiKeyFieldType } from '@/options/uiState';
import type { AppSettings, ProviderTestResult, UserNotice } from '@/shared/types';
import type { SettingsFormState } from '@/domain/options/settings-form-state';
import { listTtsProviderAdapters } from '@/lib/tts/registry';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderCheckboxField(name: string, checked: boolean, label: string): string {
  return `
    <label class="toggle-row">
      <input name="${name}" type="checkbox" ${checked ? 'checked' : ''} />
      <span>${label}</span>
    </label>
  `;
}

export class OptionsView {
  private readonly form: HTMLFormElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly statusNode: HTMLDivElement;
  private readonly ttsProviderOptions = listTtsProviderAdapters();

  constructor(private readonly documentRef: Document) {
    const form = documentRef.querySelector<HTMLFormElement>('#settings-form');
    const saveButton = documentRef.querySelector<HTMLButtonElement>('#save-button');
    const resetButton = documentRef.querySelector<HTMLButtonElement>('#reset-button');
    const statusNode = documentRef.querySelector<HTMLDivElement>('#status');
    if (!form || !saveButton || !resetButton || !statusNode) {
      throw new Error('设置页初始化失败：缺少必要的 DOM 节点。');
    }
    this.form = form;
    this.saveButton = saveButton;
    this.resetButton = resetButton;
    this.statusNode = statusNode;
  }

  getForm(): HTMLFormElement {
    return this.form;
  }

  bind(args: {
    onSave: () => void;
    onReset: () => void;
    onFormChange: (event: Event) => void;
    onFormClick: (event: MouseEvent) => void;
  }): void {
    this.saveButton.addEventListener('click', () => args.onSave());
    this.resetButton.addEventListener('click', () => args.onReset());
    this.form.addEventListener('change', args.onFormChange);
    this.form.addEventListener('click', args.onFormClick);
  }

  renderNotice(notice: UserNotice): void {
    const tone =
      notice.category === 'success'
        ? 'success'
        : ['permission-denied', 'network', 'provider-rejected', 'invalid-response', 'audio-playback', 'browser-unsupported', 'unknown'].includes(
              notice.category
            )
          ? 'danger'
          : 'default';
    this.statusNode.dataset.tone = tone;
    this.statusNode.innerHTML = `
      <div class="notice-title">${escapeHtml(notice.title)}</div>
      <div class="notice-body">${escapeHtml(notice.message)}</div>
      <div class="notice-action">${escapeHtml(notice.recommendedAction)}</div>
      ${notice.debugDetails ? `<details><summary>查看调试信息</summary><div>${escapeHtml(notice.debugDetails)}</div></details>` : ''}
    `;
  }

  render(args: {
    settings: AppSettings;
    formState: SettingsFormState;
    apiKeyVisibility: Record<'llm' | 'tts', boolean>;
    providerResults: Partial<Record<'llm' | 'tts', ProviderTestResult>>;
    previewReady: boolean;
  }): void {
    const { settings, formState, apiKeyVisibility, providerResults, previewReady } = args;

    this.form.innerHTML = `
      <section class="config-section emphasized">
        <div class="section-copy">
          <span class="section-kicker">先让它开口</span>
          <h2>先把语音服务配好。</h2>
        </div>
        <div class="card-grid">
          ${renderTtsQuickStartCard({
            provider: settings.providers.tts,
            providerOptions: this.ttsProviderOptions.map((item) => ({ id: item.id, label: item.label })),
            apiKeyType: getApiKeyFieldType(apiKeyVisibility.tts),
            apiKeyVisible: apiKeyVisibility.tts,
            result: providerResults.tts,
            previewReady
          })}
        </div>
      </section>
      <section class="config-section">
        <div class="section-copy">
          <span class="section-kicker">再让它更聪明</span>
          <h2>智能整理只影响讲解方式。</h2>
        </div>
        <div class="card-grid">
          <article class="config-card">
            <div class="card-head">
              <div><h3>LLM 配置</h3></div>
              ${renderCheckboxField('llm.enabled', formState.llm.enabled, '启用智能整理')}
            </div>
            <div class="field-grid">
              <label>Base URL<input name="llm.baseUrl" value="${escapeHtml(formState.llm.baseUrl)}" /></label>
              <label>模型<input name="llm.modelOrVoice" value="${escapeHtml(formState.llm.modelOrVoice)}" /></label>
              <label>API Key<input name="llm.apiKeyStoredLocally" value="${escapeHtml(formState.llm.apiKeyStoredLocally)}" type="${getApiKeyFieldType(apiKeyVisibility.llm)}" /></label>
              <label>Temperature<input name="llm.temperature" type="number" min="0" max="1" step="0.1" value="${formState.llm.temperature ?? 0.3}" /></label>
            </div>
            <label class="subtle-toggle">
              <input data-toggle-api-key="llm" type="checkbox" ${apiKeyVisibility.llm ? 'checked' : ''} />
              <span>显示 Key</span>
            </label>
            <div class="provider-actions">
              <button class="primary test-provider-button" data-provider-kind="llm" type="button">测试智能整理</button>
              ${providerResults.llm ? `<span class="inline-feedback ${providerResults.llm.ok ? 'ok' : 'error'}">${escapeHtml(providerResults.llm.title)}</span>` : ''}
            </div>
            <details class="advanced">
              <summary>高级设置</summary>
              <div class="advanced-grid">
                <label>自定义请求头（JSON）<textarea name="llm.headers">${escapeHtml(formState.llm.headersText)}</textarea></label>
                ${renderCheckboxField('llm.allowInsecureTransport', formState.llm.allowInsecureTransport, '允许 HTTP（开发）')}
                ${renderCheckboxField('llm.allowPrivateNetwork', formState.llm.allowPrivateNetwork, '允许私网（开发）')}
              </div>
            </details>
          </article>
          <article class="config-card secondary-card">
            <div class="card-head"><div><h3>默认播放偏好</h3></div></div>
            <div class="field-grid">
              <label>默认模式
                <select name="playback.mode">
                  <option value="smart" ${formState.playback.mode === 'smart' ? 'selected' : ''}>智能整理</option>
                  <option value="original" ${formState.playback.mode === 'original' ? 'selected' : ''}>原文直读</option>
                </select>
              </label>
              <label>默认语音引擎
                <select name="playback.speechEngine">
                  <option value="browser" ${formState.playback.speechEngine === 'browser' ? 'selected' : ''}>浏览器 / 系统语音</option>
                  <option value="remote" ${formState.playback.speechEngine === 'remote' ? 'selected' : ''}>远端 TTS</option>
                </select>
              </label>
              <label>默认代码策略
                <select name="playback.codeStrategy">
                  <option value="summary" ${formState.playback.codeStrategy === 'summary' ? 'selected' : ''}>讲作用</option>
                  <option value="full" ${formState.playback.codeStrategy === 'full' ? 'selected' : ''}>念原文</option>
                  <option value="skip" ${formState.playback.codeStrategy === 'skip' ? 'selected' : ''}>跳过代码</option>
                </select>
              </label>
              <label>默认倍速<input name="playback.rate" type="number" min="0.5" max="2" step="0.1" value="${formState.playback.rate}" /></label>
            </div>
          </article>
        </div>
      </section>
    `;
  }
}
