import type { ProviderConfig, ProviderTestResult } from '@/lib/shared/types';

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
      <span class="toggle-label">${label}</span>
    </label>
  `;
}

export function renderTtsQuickStartCard(args: {
  provider: ProviderConfig;
  providerOptions: Array<{ id: string; label: string }>;
  apiKeyType: 'password' | 'text';
  apiKeyVisible: boolean;
  result?: ProviderTestResult;
  previewReady: boolean;
}): string {
  const { provider, providerOptions, apiKeyType, apiKeyVisible, result, previewReady } = args;

  return `
    <article class="config-card">
      <div class="card-head">
        <div>
          <h3>TTS 快速配置</h3>
        </div>
        ${renderCheckboxField('tts.enabled', provider.enabled, '启用 TTS')}
      </div>
      <div class="field-grid compact">
        <label>
          Provider
          <select name="tts.providerId">
            ${providerOptions
              .map((item) => `<option value="${item.id}" ${provider.providerId === item.id ? 'selected' : ''}>${item.label}</option>`)
              .join('')}
          </select>
        </label>
        <label>
          API Key
          <input name="tts.apiKeyStoredLocally" value="${escapeHtml(provider.apiKeyStoredLocally)}" type="${apiKeyType}" autocomplete="off" spellcheck="false" />
        </label>
        <label>
          模型
          <input name="tts.modelOrVoice" value="${escapeHtml(provider.modelOrVoice)}" />
        </label>
        <label>
          音色
          <input name="tts.voiceId" value="${escapeHtml(provider.voiceId || 'alloy')}" />
        </label>
      </div>
      <label class="subtle-toggle">
        <input data-toggle-api-key="tts" type="checkbox" ${apiKeyVisible ? 'checked' : ''} />
        <span class="toggle-label">显示 Key</span>
      </label>
      <div class="provider-actions">
        <button class="primary test-provider-button" data-provider-kind="tts" type="button">测试声音服务</button>
        ${previewReady ? '<button class="secondary" id="preview-tts-sample" type="button">试听一下</button>' : ''}
        ${result ? `<span class="inline-feedback ${result.ok ? 'ok' : 'error'}">${escapeHtml(result.title)}</span>` : ''}
      </div>
      <details class="advanced">
        <summary>高级设置</summary>
        <div class="advanced-grid">
          <label>
            Base URL
            <input name="tts.baseUrl" value="${escapeHtml(provider.baseUrl)}" />
          </label>
          <label>
            自定义请求头（JSON）
            <textarea name="tts.headers">${escapeHtml(JSON.stringify(provider.headers || {}, null, 2))}</textarea>
          </label>
          ${renderCheckboxField('tts.allowInsecureTransport', provider.allowInsecureTransport ?? false, '允许 HTTP（开发）')}
          ${renderCheckboxField('tts.allowPrivateNetwork', provider.allowPrivateNetwork ?? false, '允许私网（开发）')}
        </div>
      </details>
    </article>
  `;
}
