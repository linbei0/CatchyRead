import browser from 'webextension-polyfill';

import { detectPlaybackCapabilities } from '@/content/capabilities';
import { shouldHandlePageSelection } from '@/content/page-selection-mode';
import { PageRefreshWatcher } from '@/content/page-refresh';
import { resolvePlaybackPreparation } from '@/content/playbackQueue';
import { getCollapsedVisibilityModel } from '@/content/playerUiState';
import { resolvePreviewKeyboardAction } from '@/content/preview-keyboard';
import { RemoteAudioUrlCache } from '@/content/remote-audio-url-cache';
import { RuntimeCacheRegistry } from '@/lib/cache/runtime-cache-registry';
import { buildSpokenSegments } from '@/lib/extract/blockProcessing';
import { extractPageSnapshot } from '@/lib/extract/pageSnapshot';
import { isProviderConfigured } from '@/lib/shared/messages';
import type { RuntimeMessage } from '@/lib/shared/messages';
import type {
  AppSettings,
  CodeStrategy,
  PageSnapshot,
  ReadingMode,
  RemoteAudioPayload,
  SmartScriptSegment,
  SpeechEngine
} from '@/lib/shared/types';

const HOST_ID = 'catchyread-player-host';
const HIGHLIGHT_STYLE_ID = 'catchyread-highlight-style';

function playerCss(): string {
  return `
    :host { all: initial; font-family: "Segoe UI", "PingFang SC", sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
    .panel {
      width: min(388px, calc(100vw - 28px));
      color: #eff6ff;
      background:
        radial-gradient(circle at top right, rgba(56, 189, 248, 0.22), transparent 34%),
        linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.94));
      border: 1px solid rgba(96, 165, 250, 0.18);
      border-radius: 24px;
      padding: 16px;
      box-shadow: 0 28px 64px rgba(15, 23, 42, 0.34);
      backdrop-filter: blur(16px);
    }
    .dragbar, .row, .toolbar-actions, .content-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .dragbar { justify-content: space-between; align-items: center; cursor: move; margin-bottom: 14px; }
    .brand { display: grid; gap: 4px; }
    .eyebrow { color: #7dd3fc; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; }
    .title { margin: 0; font-size: 20px; line-height: 1; font-weight: 800; }
    .status { display: grid; gap: 6px; margin-bottom: 12px; color: #bfdbfe; font-size: 13px; }
    .error { color: #fca5a5; }
    button, select {
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 999px;
      padding: 10px 14px;
      font: inherit;
      cursor: pointer;
      color: #eff6ff;
      background: rgba(30, 41, 59, 0.88);
    }
    button.primary { background: linear-gradient(135deg, #7dd3fc, #818cf8); color: #0f172a; font-weight: 800; border: 0; }
    .preview { margin-top: 10px; display: grid; gap: 8px; max-height: 240px; overflow: auto; padding-right: 4px; }
    .preview button {
      text-align: left;
      border-radius: 18px;
      padding: 12px 14px;
      display: grid;
      gap: 5px;
      background: rgba(15, 23, 42, 0.68);
    }
    .preview button.active { border-color: rgba(129, 140, 248, 0.56); background: rgba(30, 41, 59, 0.95); }
    .preview button:focus-visible { outline: 2px solid rgba(125, 211, 252, 0.92); outline-offset: 2px; }
    .preview small { color: #93c5fd; }
    .collapsed .status, .collapsed .row, .collapsed .content-actions, .collapsed .preview { display: none; }
    .collapsed .panel { width: auto; }
  `;
}

function ensureHighlightStyle(): void {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    [data-catchyread-current="true"] {
      outline: 2px solid rgba(129, 140, 248, 0.9);
      outline-offset: 4px;
      background: rgba(129, 140, 248, 0.08);
      border-radius: 10px;
    }
  `;
  document.documentElement.append(style);
}

class CatchyReadContent {
  private host: HTMLDivElement | null = null;
  private root: HTMLDivElement | null = null;
  private status: HTMLDivElement | null = null;
  private preview: HTMLDivElement | null = null;
  private modeSelect: HTMLSelectElement | null = null;
  private codeSelect: HTMLSelectElement | null = null;
  private engineSelect: HTMLSelectElement | null = null;
  private speedSelect: HTMLSelectElement | null = null;
  private playPauseButton: HTMLButtonElement | null = null;
  private settings: AppSettings | null = null;
  private snapshot: PageSnapshot | null = null;
  private originalSegments: SmartScriptSegment[] = [];
  private smartSegments: SmartScriptSegment[] = [];
  private currentSegments: SmartScriptSegment[] = [];
  private currentIndex = 0;
  private currentMode: ReadingMode = 'smart';
  private currentCodeStrategy: CodeStrategy = 'summary';
  private currentSpeechEngine: SpeechEngine = 'browser';
  private open = false;
  private speaking = false;
  private pageSelectionMode = false;
  private pageSnapshotStale = false;
  private highlightedIds: string[] = [];
  private remoteAudio = new Audio();
  private remoteAudioPayloadCache = new Map<string, Promise<RemoteAudioPayload>>();
  private remoteAudioUrlCache = new RemoteAudioUrlCache(3);
  private persistUiTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly capabilities = detectPlaybackCapabilities();
  private readonly pageRefreshWatcher = new PageRefreshWatcher(() => this.markPageStale());
  private readonly cacheRegistry = new RuntimeCacheRegistry();

  constructor() {
    ensureHighlightStyle();
    this.remoteAudio.addEventListener('ended', () => {
      this.speaking = false;
      void this.advance(1);
    });
    this.remoteAudio.addEventListener('error', () => this.fail('远端音频播放失败，请检查 TTS 设置。'));
    document.addEventListener('click', (event) => this.onDocumentClick(event), true);
    browser.runtime.onMessage.addListener((message: unknown) => {
      const typedMessage = message as RuntimeMessage;
      if (typedMessage.type === 'catchyread/toggle-player') {
        void this.toggle();
      }
    });
  }

  private mount(): void {
    if (this.host) {
      return;
    }

    this.host = document.createElement('div');
    this.host.id = HOST_ID;
    Object.assign(this.host.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      display: 'none'
    });
    const shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = playerCss();
    this.root = document.createElement('div');
    this.root.innerHTML = `
      <div class="panel">
        <div class="dragbar">
          <div class="brand">
            <span class="eyebrow">CatchyRead</span>
            <h2 class="title">网页会讲了</h2>
          </div>
          <div class="toolbar-actions">
            <button id="collapse" type="button">折叠</button>
            <button id="close" type="button">关闭</button>
          </div>
        </div>
        <div class="status" id="status" role="status" aria-live="polite"></div>
        <div class="row">
          <select id="mode">
            <option value="smart">智能模式</option>
            <option value="original">原文模式</option>
          </select>
          <select id="code">
            <option value="summary">代码摘要</option>
            <option value="full">代码原文</option>
          </select>
          <select id="engine">
            <option value="browser">浏览器语音</option>
            <option value="remote">远端 TTS</option>
          </select>
          <select id="speed">
            <option value="0.9">0.9x</option>
            <option value="1">1.0x</option>
            <option value="1.2">1.2x</option>
            <option value="1.4">1.4x</option>
            <option value="1.6">1.6x</option>
          </select>
        </div>
        <div class="content-actions" style="margin-top:10px;">
          <button class="primary" id="smart-start" type="button">整理后朗读</button>
          <button id="original-start" type="button">直接朗读原文</button>
          <button id="refresh-page" type="button">刷新内容</button>
          <button id="pick-from-page" type="button" aria-pressed="false">页面定位</button>
          <button id="play-pause" type="button">播放</button>
          <button id="prev" type="button">上一段</button>
          <button id="next" type="button">下一段</button>
          <button id="settings" type="button">设置</button>
        </div>
        <div class="preview" id="preview"></div>
      </div>
    `;
    shadow.append(style, this.root);
    document.documentElement.append(this.host);

    this.status = this.root.querySelector('#status');
    this.preview = this.root.querySelector('#preview');
    this.modeSelect = this.root.querySelector('#mode');
    this.codeSelect = this.root.querySelector('#code');
    this.engineSelect = this.root.querySelector('#engine');
    this.speedSelect = this.root.querySelector('#speed');
    this.playPauseButton = this.root.querySelector('#play-pause');

    this.root.querySelector<HTMLButtonElement>('#close')?.addEventListener('click', () => this.hide());
    this.root.querySelector<HTMLButtonElement>('#collapse')?.addEventListener('click', () => this.toggleCollapsed());
    this.root.querySelector<HTMLButtonElement>('#smart-start')?.addEventListener('click', () => void this.start('smart'));
    this.root.querySelector<HTMLButtonElement>('#original-start')?.addEventListener('click', () => void this.start('original'));
    this.root.querySelector<HTMLButtonElement>('#refresh-page')?.addEventListener('click', () => this.refreshPageContent());
    this.root.querySelector<HTMLButtonElement>('#pick-from-page')?.addEventListener('click', () => this.togglePageSelectionMode());
    this.playPauseButton?.addEventListener('click', () => void this.playPause());
    this.root.querySelector<HTMLButtonElement>('#prev')?.addEventListener('click', () => void this.advance(-1));
    this.root.querySelector<HTMLButtonElement>('#next')?.addEventListener('click', () => void this.advance(1));
    this.root
      .querySelector<HTMLButtonElement>('#settings')
      ?.addEventListener('click', () => void browser.runtime.sendMessage({ type: 'catchyread/open-options' } satisfies RuntimeMessage));
    this.modeSelect?.addEventListener('change', () => {
      this.currentMode = (this.modeSelect?.value || 'smart') as ReadingMode;
      this.renderPreview();
    });
    this.codeSelect?.addEventListener('change', () => {
      this.currentCodeStrategy = (this.codeSelect?.value || 'summary') as CodeStrategy;
      this.rebuildOriginalSegments();
      this.renderPreview();
    });
    this.engineSelect?.addEventListener('change', () => {
      this.currentSpeechEngine = (this.engineSelect?.value || 'browser') as SpeechEngine;
    });
    this.speedSelect?.addEventListener('change', () => {
      if (this.settings) {
        this.settings.playback.rate = Number(this.speedSelect?.value || 1);
      }
    });

    this.enableDrag();
    this.root.addEventListener('keydown', (event) => this.onRootKeyDown(event));
    this.applyCollapsedState(false, false);
    this.cacheRegistry.register('remote-audio', () => this.clearRemoteAudioCaches());
    this.cacheRegistry.register('smart-segments', () => {
      this.smartSegments = [];
    });
    this.cacheRegistry.register('page-snapshot', () => {
      this.snapshot = null;
      this.originalSegments = [];
      this.currentSegments = [];
    });
  }

  async toggle(): Promise<void> {
    if (this.open) {
      this.hide();
      return;
    }
    await this.show();
  }

  private async show(): Promise<void> {
    this.mount();
    this.host!.style.display = 'block';
    this.open = true;
    await this.loadSettings();
    this.applyCapabilityConstraints();
    this.refreshPageContent(false);
    this.pageRefreshWatcher.start();
  }

  private hide(): void {
    this.stopAll();
    this.pageRefreshWatcher.stop();
    this.cacheRegistry.clearGroup('remote-audio');
    this.setPageSelectionMode(false);
    this.host && (this.host.style.display = 'none');
    this.open = false;
    this.clearHighlight();
  }

  private toggleCollapsed(): void {
    const nextCollapsed = !this.root?.classList.contains('collapsed');
    this.applyCollapsedState(nextCollapsed, true);
  }

  private applyCollapsedState(collapsed: boolean, persist: boolean): void {
    const model = getCollapsedVisibilityModel(collapsed);
    this.root?.classList.toggle('collapsed', !model.showContentControls);
    const collapseButton = this.root?.querySelector<HTMLButtonElement>('#collapse');
    if (collapseButton) {
      collapseButton.textContent = model.collapseButtonLabel;
      collapseButton.setAttribute('aria-expanded', String(model.showContentControls));
    }
    if (persist) {
      this.persistUiState({ collapsed });
    }
  }

  private async loadSettings(): Promise<void> {
    const result = (await browser.runtime.sendMessage({ type: 'catchyread/get-settings' } satisfies RuntimeMessage)) as {
      settings: AppSettings;
    };
    this.settings = result.settings;
    this.currentMode = result.settings.playback.mode;
    this.currentCodeStrategy = result.settings.playback.codeStrategy;
    this.currentSpeechEngine = result.settings.playback.speechEngine;
    this.modeSelect && (this.modeSelect.value = this.currentMode);
    this.codeSelect && (this.codeSelect.value = this.currentCodeStrategy);
    this.engineSelect && (this.engineSelect.value = this.currentSpeechEngine);
    this.speedSelect && (this.speedSelect.value = String(result.settings.playback.rate));
    this.applyCollapsedState(result.settings.ui.collapsed, false);
    if (this.host && result.settings.ui.x !== null && result.settings.ui.y !== null) {
      this.host.style.left = `${result.settings.ui.x}px`;
      this.host.style.top = `${result.settings.ui.y}px`;
      this.host.style.right = 'auto';
      this.host.style.bottom = 'auto';
    }
  }

  private rebuildOriginalSegments(): void {
    if (!this.snapshot) {
      return;
    }
    this.originalSegments = buildSpokenSegments(this.snapshot.structuredBlocks, {
      mode: 'original',
      codeStrategy: this.currentCodeStrategy,
      maxSegmentChars: 220
    });
  }

  private refreshPageContent(showStatus = true): void {
    this.cacheRegistry.clearGroup('smart-segments');
    this.snapshot = extractPageSnapshot(document);
    this.rebuildOriginalSegments();
    if (this.currentMode === 'original') {
      this.currentSegments = this.originalSegments;
    }
    this.pageSnapshotStale = false;
    this.renderPreview();
    if (showStatus && this.snapshot) {
      this.setStatus(`内容已刷新，当前提取到 ${this.snapshot.structuredBlocks.length} 个结构块。`);
    }
  }

  private markPageStale(): void {
    if (!this.open) {
      return;
    }
    this.pageSnapshotStale = true;
    this.setStatus('页面内容已变化，建议点击“刷新内容”重新提取正文。');
  }

  private applyCapabilityConstraints(): void {
    const browserOption = this.engineSelect?.querySelector<HTMLOptionElement>('option[value="browser"]');
    if (browserOption) {
      browserOption.disabled = !this.capabilities.browserTtsAvailable;
      browserOption.textContent = this.capabilities.browserTtsAvailable ? '浏览器语音' : '浏览器语音（当前不可用）';
    }

    if (!this.capabilities.browserTtsAvailable && this.currentSpeechEngine === 'browser') {
      this.currentSpeechEngine = 'remote';
      if (this.engineSelect) {
        this.engineSelect.value = 'remote';
      }
    }

    if (!this.capabilities.pointerEventsSupported) {
      this.setStatus('当前浏览器对拖拽支持有限，但仍可使用朗读与预览功能。');
    }
  }

  private async start(mode: ReadingMode, startIndex = 0): Promise<void> {
    if (!this.settings || !this.snapshot) {
      return;
    }
    this.currentMode = mode;
    this.modeSelect && (this.modeSelect.value = mode);
    if (mode === 'smart') {
      if (!isProviderConfigured(this.settings.providers.llm)) {
        this.fail('智能模式需要先配置 LLM，且不会偷偷回退。');
        return;
      }
      this.setStatus('正在整理网页内容…');
      try {
        const result = (await browser.runtime.sendMessage({
          type: 'catchyread/rewrite',
          payload: {
            blocks: this.snapshot.structuredBlocks,
            policy: {
              preserveFacts: true,
              tone: 'podcast-lite',
              maxSegmentChars: 220
            }
          }
        } satisfies RuntimeMessage)) as { segments: SmartScriptSegment[] };
        this.smartSegments = result.segments;
        this.currentSegments = this.smartSegments;
      } catch (error) {
        this.fail(error instanceof Error ? error.message : '智能整理失败。');
        return;
      }
    } else {
      this.currentSegments = this.originalSegments;
    }
    this.cacheRegistry.clearGroup('remote-audio');
    this.currentIndex = Math.min(startIndex, Math.max(this.currentSegments.length - 1, 0));
    this.renderPreview();
    await this.playCurrent();
  }

  private async playPause(): Promise<void> {
    const preparation = resolvePlaybackPreparation({
      mode: this.currentMode,
      currentSegments: this.currentSegments,
      originalSegments: this.originalSegments,
      smartSegments: this.smartSegments
    });

    if (preparation === 'prepare-smart') {
      await this.start('smart', this.currentIndex);
      return;
    }

    if (preparation === 'prepare-original') {
      await this.start('original', this.currentIndex);
      return;
    }

    if (this.currentSpeechEngine === 'remote') {
      if (this.remoteAudio.src && !this.remoteAudio.paused) {
        this.remoteAudio.pause();
        this.speaking = false;
        this.updatePlayPauseLabel('继续');
        return;
      }
      if (this.remoteAudio.src && this.remoteAudio.paused) {
        await this.remoteAudio.play();
        this.speaking = true;
        this.updatePlayPauseLabel('暂停');
        return;
      }
    } else if (speechSynthesis.speaking) {
      if (speechSynthesis.paused) {
        speechSynthesis.resume();
        this.speaking = true;
        this.updatePlayPauseLabel('暂停');
      } else {
        speechSynthesis.pause();
        this.speaking = false;
        this.updatePlayPauseLabel('继续');
      }
      return;
    }

    await this.playCurrent();
  }

  private async playCurrent(): Promise<void> {
    const segment = this.currentSegments[this.currentIndex];
    if (!segment || !this.settings) {
      this.setStatus('没有可朗读的内容。');
      return;
    }

    this.stopAll();
    this.highlight(segment);
    this.setStatus(`正在朗读：${segment.sectionTitle}`);
    this.updatePlayPauseLabel('暂停');

    if (this.currentSpeechEngine === 'remote') {
      if (!isProviderConfigured(this.settings.providers.tts)) {
        this.fail('远端 TTS 未配置，请切换到浏览器语音或先填写设置。');
        return;
      }
      try {
        const objectUrl = await this.getRemoteAudioUrlForIndex(this.currentIndex);
        this.remoteAudio.src = objectUrl;
        this.remoteAudio.playbackRate = this.settings.playback.rate;
        await this.remoteAudio.play();
        this.speaking = true;
        void this.prefetchRemoteAudio(this.currentIndex + 1);
        return;
      } catch (error) {
        this.fail(error instanceof Error ? error.message : '远端 TTS 播放失败。');
        return;
      }
    }

    const utterance = new SpeechSynthesisUtterance(segment.spokenText);
    utterance.lang = this.snapshot?.language || 'zh-CN';
    utterance.rate = this.settings.playback.rate;
    utterance.onend = () => {
      this.speaking = false;
      void this.advance(1);
    };
    utterance.onerror = () => this.fail('浏览器语音播放失败。');
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
    this.speaking = true;
  }

  private async advance(step: number): Promise<void> {
    if (!this.currentSegments.length) {
      return;
    }

    const nextIndex = this.currentIndex + step;
    if (nextIndex < 0) {
      this.currentIndex = 0;
      this.renderPreview();
      this.setStatus('已经在第一段。');
      return;
    }
    if (nextIndex >= this.currentSegments.length) {
      this.stopAll();
      this.currentIndex = this.currentSegments.length - 1;
      this.renderPreview();
      this.setStatus('已经来到最后一段。');
      return;
    }

    this.currentIndex = nextIndex;
    this.renderPreview();
    await this.playCurrent();
  }

  private updatePlayPauseLabel(label: string): void {
    if (this.playPauseButton) {
      this.playPauseButton.textContent = label;
    }
  }

  private stopAll(): void {
    this.remoteAudio.pause();
    this.remoteAudio.removeAttribute('src');
    this.remoteAudio.load();
    speechSynthesis.cancel();
    this.speaking = false;
    this.updatePlayPauseLabel('播放');
  }

  private setStatus(message: string, isError = false): void {
    if (!this.status) {
      return;
    }
    this.status.textContent = message;
    this.status.classList.toggle('error', isError);
  }

  private fail(message: string): void {
    this.stopAll();
    this.cacheRegistry.clearGroup('remote-audio');
    this.setStatus(message, true);
  }

  private previewSource(): SmartScriptSegment[] {
    if (this.currentMode === 'smart' && this.smartSegments.length) {
      return this.smartSegments;
    }
    return this.originalSegments;
  }

  private renderPreview(): void {
    if (!this.preview) {
      return;
    }
    const segments = this.previewSource();
    this.preview.innerHTML = '';
    this.preview.setAttribute('role', 'listbox');
    if (this.pageSnapshotStale) {
      this.preview.dataset.stale = 'true';
    } else {
      delete this.preview.dataset.stale;
    }
    segments.forEach((segment, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = index === this.currentIndex ? 'active' : '';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === this.currentIndex));
      button.tabIndex = index === this.currentIndex ? 0 : -1;
      const sectionLabel = document.createElement('small');
      sectionLabel.textContent = segment.sectionTitle;
      const spokenText = document.createElement('span');
      spokenText.textContent = segment.spokenText;
      button.append(sectionLabel, spokenText);
      button.addEventListener('click', () => {
        this.currentSegments = segments;
        this.currentIndex = index;
        this.renderPreview();
        button.focus();
        if (this.speaking) {
          void this.playCurrent();
        } else {
          this.setStatus('已定位到该段，点击播放即可从这里开始。');
        }
      });
      this.preview?.append(button);
    });
  }

  private highlight(segment: SmartScriptSegment): void {
    this.clearHighlight();
    this.highlightedIds = [...segment.sourceBlockIds];
    segment.sourceBlockIds.forEach((id) => {
      document.querySelector(`[data-catchyread-block-id="${id}"]`)?.setAttribute('data-catchyread-current', 'true');
    });
  }

  private clearHighlight(): void {
    this.highlightedIds.forEach((id) => {
      document.querySelector(`[data-catchyread-block-id="${id}"]`)?.removeAttribute('data-catchyread-current');
    });
    this.highlightedIds = [];
  }

  private onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const clickedInsidePlayer = Boolean(target.closest(`#${HOST_ID}`));
    const source = target.closest<HTMLElement>('[data-catchyread-block-id]');
    if (
      !shouldHandlePageSelection({
        isOpen: this.open,
        selectionMode: this.pageSelectionMode,
        clickedInsidePlayer,
        hasBlockTarget: Boolean(source)
      })
    ) {
      return;
    }
    if (!source) {
      return;
    }
    const sourceId = source.getAttribute('data-catchyread-block-id') || '';
    const segments = this.previewSource();
    const index = segments.findIndex((item) => item.sourceBlockIds.includes(sourceId));
    if (index >= 0) {
      event.preventDefault();
      event.stopPropagation();
      this.currentSegments = segments;
      this.currentIndex = index;
      this.renderPreview();
      this.setPageSelectionMode(false);
      if (this.speaking) {
        void this.playCurrent();
      } else {
        this.setStatus('已跳转到该段。');
      }
    }
  }

  private enableDrag(): void {
    if (!this.capabilities.pointerEventsSupported) {
      return;
    }
    const dragbar = this.root?.querySelector<HTMLElement>('.dragbar');
    if (!dragbar || !this.host) {
      return;
    }
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let baseLeft = 0;
    let baseTop = 0;

    dragbar.addEventListener('pointerdown', (event) => {
      if ((event.target as HTMLElement)?.closest('button')) {
        return;
      }
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      const rect = this.host!.getBoundingClientRect();
      baseLeft = rect.left;
      baseTop = rect.top;
      dragbar.setPointerCapture(event.pointerId);
    });

    dragbar.addEventListener('pointermove', (event) => {
      if (!dragging) {
        return;
      }
      const left = Math.max(8, baseLeft + event.clientX - startX);
      const top = Math.max(8, baseTop + event.clientY - startY);
      this.host!.style.left = `${left}px`;
      this.host!.style.top = `${top}px`;
      this.host!.style.right = 'auto';
      this.host!.style.bottom = 'auto';
    });

    const stop = () => {
      dragging = false;
      if (this.host) {
        const rect = this.host.getBoundingClientRect();
        this.persistUiState({
          x: Math.round(rect.left),
          y: Math.round(rect.top)
        });
      }
    };
    dragbar.addEventListener('pointerup', stop);
    dragbar.addEventListener('pointercancel', stop);
  }

  private remoteCacheKey(index: number): string {
    const segment = this.currentSegments[index];
    const voice = this.settings?.providers.tts.voiceId || 'default';
    const rate = this.settings?.playback.rate || 1;
    return `${segment?.id || 'missing'}::${voice}::${rate}`;
  }

  private async getRemoteAudioForIndex(index: number): Promise<RemoteAudioPayload> {
    const segment = this.currentSegments[index];
    if (!segment || !this.settings) {
      throw new Error('没有可播放的远端语音片段。');
    }

    const key = this.remoteCacheKey(index);
    if (!this.remoteAudioPayloadCache.has(key)) {
      this.remoteAudioPayloadCache.set(
        key,
        browser
          .runtime
          .sendMessage({
            type: 'catchyread/synthesize-remote',
            payload: {
              text: segment.spokenText,
              rate: this.settings.playback.rate,
              voiceId: this.settings.providers.tts.voiceId
            }
          } satisfies RuntimeMessage)
          .then((result) => (result as { audio: RemoteAudioPayload }).audio)
      );
    }

    return this.remoteAudioPayloadCache.get(key)!;
  }

  private async getRemoteAudioUrlForIndex(index: number): Promise<string> {
    const key = this.remoteCacheKey(index);
    const cachedUrl = this.remoteAudioUrlCache.get(key);
    if (cachedUrl) {
      return cachedUrl;
    }

    const audio = await this.getRemoteAudioForIndex(index);
    if (audio.mediaUrl) {
      return audio.mediaUrl;
    }

    if (!audio.base64Audio) {
      throw new Error('远端音频响应既没有 mediaUrl，也没有 base64Audio。');
    }

    const binary = atob(audio.base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let offset = 0; offset < binary.length; offset += 1) {
      bytes[offset] = binary.charCodeAt(offset);
    }
    return this.remoteAudioUrlCache.set(
      key,
      new Blob([bytes.buffer], { type: audio.mimeType || 'audio/mpeg' })
    );
  }

  private async prefetchRemoteAudio(index: number): Promise<void> {
    if (this.currentSpeechEngine !== 'remote' || !this.settings || !isProviderConfigured(this.settings.providers.tts)) {
      return;
    }
    if (index < 0 || index >= this.currentSegments.length) {
      return;
    }
    try {
      await this.getRemoteAudioUrlForIndex(index);
    } catch {
      this.remoteAudioPayloadCache.delete(this.remoteCacheKey(index));
    }
  }

  private clearRemoteAudioCaches(): void {
    this.remoteAudioPayloadCache.clear();
    this.remoteAudioUrlCache.clear();
  }

  private togglePageSelectionMode(): void {
    this.setPageSelectionMode(!this.pageSelectionMode);
    this.setStatus(this.pageSelectionMode ? '已进入页面定位模式，点击正文任一段即可跳转。' : '已退出页面定位模式。');
  }

  private setPageSelectionMode(enabled: boolean): void {
    this.pageSelectionMode = enabled;
    const button = this.root?.querySelector<HTMLButtonElement>('#pick-from-page');
    if (button) {
      button.setAttribute('aria-pressed', String(enabled));
      button.textContent = enabled ? '退出定位' : '页面定位';
    }
  }

  private onRootKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.pageSelectionMode) {
        event.preventDefault();
        this.setPageSelectionMode(false);
        this.setStatus('已退出页面定位模式。');
        return;
      }
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.closest('.preview')) {
      return;
    }

    const previewButtons = Array.from(this.preview?.querySelectorAll<HTMLButtonElement>('button') || []);
    const currentPreviewIndex = previewButtons.indexOf(target);
    if (currentPreviewIndex < 0) {
      return;
    }

    const action = resolvePreviewKeyboardAction(event.key, currentPreviewIndex, previewButtons.length);
    if (!action.handled) {
      return;
    }

    event.preventDefault();
    if (action.nextIndex !== currentPreviewIndex) {
      previewButtons[action.nextIndex]?.focus();
      return;
    }
    if (action.activate) {
      target.click();
    }
  }

  private persistUiState(partial: Partial<AppSettings['ui']>): void {
    if (this.persistUiTimer) {
      clearTimeout(this.persistUiTimer);
    }
    this.persistUiTimer = setTimeout(() => {
      void browser.runtime.sendMessage({
        type: 'catchyread/save-ui-state',
        payload: partial
      } satisfies RuntimeMessage);
    }, 120);
  }
}

declare global {
  interface Window {
    __CATCHYREAD_CONTENT_READY__?: boolean;
  }
}

if (!window.__CATCHYREAD_CONTENT_READY__) {
  window.__CATCHYREAD_CONTENT_READY__ = true;
  new CatchyReadContent();
}
