import browser from 'webextension-polyfill';

import { resolveBrowserSpeechAction } from '@/content/browserSpeechState';
import { detectPlaybackCapabilities } from '@/content/capabilities';
import { renderPreviewButton } from '@/content/playerMarkup';
import { shouldHandlePageSelection } from '@/content/page-selection-mode';
import { PageRefreshWatcher } from '@/content/page-refresh';
import { resolvePlaybackPreparation } from '@/content/playbackQueue';
import { getCollapsedVisibilityModel } from '@/content/playerUiState';
import { buildPlaybackViewState } from '@/content/playerViewState';
import { resolvePreviewKeyboardAction } from '@/content/preview-keyboard';
import { RemoteAudioUrlCache } from '@/content/remote-audio-url-cache';
import { shouldIgnoreSpeechSynthesisError } from '@/content/speechSynthesisErrors';
import { RuntimeCacheRegistry } from '@/lib/cache/runtime-cache-registry';
import { buildSpokenSegments } from '@/lib/extract/blockProcessing';
import { extractPageSnapshot } from '@/lib/extract/pageSnapshot';
import { isProviderConfigured } from '@/lib/shared/messages';
import type { RuntimeMessage } from '@/lib/shared/messages';
import { buildSuccessNotice, mapErrorToNotice } from '@/lib/ui/feedback';
import type {
  AppSettings,
  CodeStrategy,
  PageSnapshot,
  PlaybackState,
  PlaybackStatus,
  ReadingMode,
  RemoteAudioPayload,
  SmartScriptSegment,
  SpeechEngine,
  UserNotice
} from '@/lib/shared/types';

const HOST_ID = 'catchyread-player-host';
const HIGHLIGHT_STYLE_ID = 'catchyread-highlight-style';

function playerCss(): string {
  return `
    :host {
      all: initial;
      font-family: Inter, "Segoe UI", "PingFang SC", sans-serif;
      --bg: #11131a;
      --panel: #171b25;
      --panel-2: #1e2431;
      --panel-3: #0f141d;
      --text: #f7f3ea;
      --muted: #b2ab9b;
      --muted-2: #8a8691;
      --line: rgba(233, 221, 197, 0.12);
      --line-strong: rgba(233, 221, 197, 0.24);
      --accent: #f6a95b;
      --accent-strong: #ffd59f;
      --accent-soft: rgba(246, 169, 91, 0.16);
      --success: #86d39e;
      --warning: #f0c66a;
      --danger: #ff8b7b;
      --radius: 26px;
      --shadow: 0 22px 70px rgba(5, 8, 15, 0.52);
    }
    *, *::before, *::after { box-sizing: border-box; }
    .panel {
      width: min(392px, calc(100vw - 20px));
      max-height: min(680px, calc(100vh - 20px));
      color: var(--text);
      background:
        radial-gradient(circle at top right, rgba(246, 169, 91, 0.14), transparent 34%),
        linear-gradient(180deg, rgba(20, 22, 30, 0.98), rgba(12, 16, 22, 0.98));
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 14px;
      box-shadow: var(--shadow);
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }
    button, select {
      font: inherit;
      color: var(--text);
    }
    button {
      cursor: pointer;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.04);
      border-radius: 999px;
      padding: 10px 14px;
      transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
    }
    button:hover { border-color: var(--line-strong); background: rgba(255, 255, 255, 0.07); }
    button:focus-visible, select:focus-visible, summary:focus-visible {
      outline: 2px solid rgba(246, 169, 91, 0.86);
      outline-offset: 2px;
    }
    .dragbar, .toolbar-actions, .mode-switch, .transport, .secondary-controls, .preview-head, .more-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .dragbar { justify-content: space-between; align-items: start; cursor: move; margin-bottom: 10px; }
    .brand { display: grid; gap: 4px; }
    .eyebrow { color: var(--accent); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; }
    .title { margin: 0; font-size: 18px; line-height: 1.02; font-weight: 800; letter-spacing: -0.02em; }
    .mode-pill {
      align-self: start;
      color: var(--accent-strong);
      background: rgba(246, 169, 91, 0.1);
      border: 1px solid rgba(246, 169, 91, 0.16);
      border-radius: 999px;
      padding: 6px 9px;
      font-size: 11px;
    }
    .ghost-button { padding: 8px 12px; min-height: 40px; }
    .hero {
      display: grid;
      gap: 10px;
      padding: 12px;
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(34, 39, 53, 0.94), rgba(18, 21, 29, 0.96));
      border: 1px solid rgba(255, 255, 255, 0.06);
      margin-bottom: 12px;
    }
    .mode-switch {
      padding: 4px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--line);
      width: fit-content;
    }
    .mode-switch button {
      border: 0;
      background: transparent;
      color: var(--muted);
      padding: 9px 12px;
      min-width: 76px;
    }
    .mode-switch button.active {
      background: linear-gradient(135deg, rgba(246, 169, 91, 0.92), rgba(255, 213, 159, 0.82));
      color: #24160a;
      font-weight: 800;
    }
    .status-card { display: grid; gap: 8px; }
    .status-meta {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      font-size: 12px;
      color: var(--muted);
    }
    .state-badge {
      color: var(--accent-strong);
      background: var(--accent-soft);
      border: 1px solid rgba(246, 169, 91, 0.18);
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 12px;
    }
    .state-badge[data-tone="success"] { color: var(--success); background: rgba(134, 211, 158, 0.12); border-color: rgba(134, 211, 158, 0.18); }
    .state-badge[data-tone="warning"] { color: var(--warning); background: rgba(240, 198, 106, 0.12); border-color: rgba(240, 198, 106, 0.18); }
    .state-badge[data-tone="danger"] { color: var(--danger); background: rgba(255, 139, 123, 0.12); border-color: rgba(255, 139, 123, 0.18); }
    .current-title { margin: 0; font-size: 17px; line-height: 1.14; letter-spacing: -0.02em; }
    .notice {
      display: grid;
      gap: 4px;
      padding: 10px 12px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .notice-title { font-weight: 700; font-size: 12px; }
    .notice-body, .notice-action { color: var(--muted); font-size: 11px; line-height: 1.35; }
    .notice.compact .notice-body,
    .notice.compact .notice-action { display: none; }
    .notice[data-tone="danger"] { border-color: rgba(255, 139, 123, 0.22); background: rgba(255, 139, 123, 0.06); }
    .notice[data-tone="success"] { border-color: rgba(134, 211, 158, 0.22); background: rgba(134, 211, 158, 0.06); }
    .notice details { color: var(--muted-2); font-size: 11px; }
    .notice summary { cursor: pointer; }
    .progress {
      display: grid;
      gap: 4px;
    }
    .progress-track {
      overflow: hidden;
      height: 8px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
    }
    .progress-fill {
      width: 0%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--accent), var(--accent-strong));
    }
    .progress-meta {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      color: var(--muted-2);
      font-size: 12px;
    }
    .transport {
      align-items: center;
      justify-content: space-between;
      margin: 10px 0 8px;
    }
    .transport button { flex: 1; min-height: 42px; }
    .transport .play-hero {
      flex: 1.45;
      border: 0;
      background: linear-gradient(135deg, rgba(246, 169, 91, 0.96), rgba(255, 213, 159, 0.86));
      color: #24160a;
      font-weight: 800;
      box-shadow: 0 12px 28px rgba(246, 169, 91, 0.22);
    }
    .secondary-controls {
      margin-bottom: 8px;
      display: flex;
      gap: 8px;
    }
    .control-chip {
      display: grid;
      gap: 6px;
      flex: 1;
      color: var(--muted);
      font-size: 12px;
    }
    select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.05);
      color-scheme: dark;
      appearance: none;
      -webkit-appearance: none;
    }
    option { background: #1b202b; color: var(--text); }
    .more {
      display: grid;
      gap: 8px;
      margin-bottom: 8px;
    }
    .more-panel {
      display: none;
      padding: 12px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--line);
      gap: 8px;
    }
    .more.open .more-panel { display: grid; }
    .more-panel button, .more-panel select { width: 100%; text-align: left; }
    .preview-head {
      align-items: center;
      justify-content: space-between;
      margin: 8px 0 6px;
      color: var(--muted);
      font-size: 12px;
    }
    .preview {
      display: grid;
      gap: 8px;
      max-height: 180px;
      overflow: auto;
      padding-right: 3px;
      scrollbar-width: thin;
    }
    .preview button {
      text-align: left;
      border-radius: 18px;
      padding: 12px 14px 12px 16px;
      display: grid;
      gap: 5px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: linear-gradient(180deg, rgba(18, 22, 31, 0.88), rgba(12, 15, 22, 0.94));
      border-left: 3px solid transparent;
      overflow: hidden;
    }
    .preview button[data-tone="main"] { border-left-color: rgba(246, 169, 91, 0.36); }
    .preview button[data-tone="warning"] { border-left-color: rgba(240, 198, 106, 0.7); }
    .preview button[data-tone="code"] { border-left-color: rgba(126, 179, 255, 0.7); }
    .preview button.active {
      transform: translateX(2px);
      border-color: rgba(246, 169, 91, 0.28);
      background: linear-gradient(180deg, rgba(39, 32, 24, 0.96), rgba(18, 17, 20, 0.98));
      box-shadow: inset 0 0 0 1px rgba(246, 169, 91, 0.1);
    }
    .preview small, .preview strong, .preview span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: block;
      min-width: 0;
    }
    .preview small { color: var(--muted-2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    .preview strong { font-size: 13px; font-weight: 700; }
    .preview span { color: var(--muted); font-size: 11px; }
    .stale-tip { color: var(--warning); }
    .collapsed .hero,
    .collapsed .secondary-controls,
    .collapsed .more,
    .collapsed .preview-head,
    .collapsed .preview { display: none; }
    .collapsed .panel { width: min(412px, calc(100vw - 24px)); }
    @media (max-height: 760px) {
      .panel { max-height: calc(100vh - 12px); }
      .hero { gap: 8px; }
      .notice { padding: 8px 10px; }
      .preview { max-height: 132px; }
    }
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
  private codeSelect: HTMLSelectElement | null = null;
  private engineSelect: HTMLSelectElement | null = null;
  private speedSelect: HTMLSelectElement | null = null;
  private playPauseButton: HTMLButtonElement | null = null;
  private currentTitleNode: HTMLHeadingElement | null = null;
  private positionNode: HTMLSpanElement | null = null;
  private stateBadgeNode: HTMLSpanElement | null = null;
  private progressFillNode: HTMLDivElement | null = null;
  private progressMetaNode: HTMLDivElement | null = null;
  private morePanel: HTMLDivElement | null = null;
  private modeButtons: HTMLButtonElement[] = [];
  private settings: AppSettings | null = null;
  private snapshot: PageSnapshot | null = null;
  private originalSegments: SmartScriptSegment[] = [];
  private smartSegments: SmartScriptSegment[] = [];
  private currentSegments: SmartScriptSegment[] = [];
  private currentIndex = 0;
  private currentMode: ReadingMode = 'smart';
  private currentCodeStrategy: CodeStrategy = 'summary';
  private currentSpeechEngine: SpeechEngine = 'browser';
  private browserSpeechUtterance: SpeechSynthesisUtterance | null = null;
  private browserSpeechPaused = false;
  private browserSpeechToken = 0;
  private open = false;
  private speaking = false;
  private pageSelectionMode = false;
  private pageSnapshotStale = false;
  private highlightedIds: string[] = [];
  private remoteAudio = new Audio();
  private remoteAudioPayloadCache = new Map<string, Promise<RemoteAudioPayload>>();
  private remoteAudioUrlCache = new RemoteAudioUrlCache(3);
  private persistUiTimer: ReturnType<typeof setTimeout> | null = null;
  private playbackState: PlaybackState = {
    status: 'idle',
    currentSegmentId: null,
    currentIndex: 0,
    totalSegments: 0,
    rate: 1,
    voiceId: 'default',
    mode: 'smart',
    speechEngine: 'browser',
    progressMode: 'segment-only',
    notice: null
  };
  private readonly capabilities = detectPlaybackCapabilities();
  private readonly pageRefreshWatcher = new PageRefreshWatcher(() => this.markPageStale());
  private readonly cacheRegistry = new RuntimeCacheRegistry();

  constructor() {
    ensureHighlightStyle();
    this.remoteAudio.preload = 'auto';
    this.remoteAudio.addEventListener('ended', () => {
      this.speaking = false;
      this.setPlaybackStatus('idle');
      void this.advance(1);
    });
    this.remoteAudio.addEventListener('play', () => {
      this.speaking = true;
      this.setPlaybackStatus('playing');
      this.renderPlaybackChrome();
    });
    this.remoteAudio.addEventListener('pause', () => {
      if (this.remoteAudio.ended) {
        return;
      }
      this.speaking = false;
      if (this.remoteAudio.src) {
        this.setPlaybackStatus('paused');
      }
      this.renderPlaybackChrome();
    });
    this.remoteAudio.addEventListener('loadedmetadata', () => {
      this.playbackState.durationSeconds = Number.isFinite(this.remoteAudio.duration) ? this.remoteAudio.duration : undefined;
      this.renderPlaybackChrome();
    });
    this.remoteAudio.addEventListener('timeupdate', () => {
      this.playbackState.currentTimeSeconds = this.remoteAudio.currentTime;
      this.playbackState.durationSeconds = Number.isFinite(this.remoteAudio.duration) ? this.remoteAudio.duration : undefined;
      this.renderPlaybackChrome();
    });
    this.remoteAudio.addEventListener('error', () => this.fail(new Error('远端音频播放失败，请检查音频格式或 TTS 设置。')));
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
            <h2 class="title">正在收听</h2>
          </div>
          <div class="toolbar-actions">
            <span class="mode-pill" id="mode-pill">智能整理</span>
            <button class="ghost-button" id="collapse" type="button">折叠</button>
            <button class="ghost-button" id="close" type="button">关闭</button>
          </div>
        </div>
        <section class="hero">
          <div class="mode-switch" role="tablist" aria-label="朗读模式">
            <button id="mode-smart" class="active" data-mode="smart" type="button">智能整理</button>
            <button id="mode-original" data-mode="original" type="button">原文直读</button>
          </div>
          <div class="status-card">
            <div class="status-meta">
              <span class="state-badge" id="state-badge">待开始</span>
              <span id="segment-position">00 / 00</span>
            </div>
            <h3 class="current-title" id="current-title">还没有开始收听</h3>
          </div>
          <div class="notice" id="status" role="status" aria-live="polite"></div>
          <div class="progress">
            <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
            <div class="progress-meta" id="progress-meta">
              <span>准备就绪</span>
              <span>等待开始</span>
            </div>
          </div>
        </section>
        <div class="transport">
          <button id="prev" type="button">上一段</button>
          <button class="play-hero" id="play-pause" type="button">开始收听</button>
          <button id="next" type="button">下一段</button>
        </div>
        <div class="secondary-controls">
          <label class="control-chip">
            语音引擎
            <select id="engine">
              <option value="browser">浏览器语音</option>
              <option value="remote">远端 TTS</option>
            </select>
          </label>
          <label class="control-chip">
            倍速
            <select id="speed">
              <option value="0.9">0.9x</option>
              <option value="1">1.0x</option>
              <option value="1.2">1.2x</option>
              <option value="1.4">1.4x</option>
              <option value="1.6">1.6x</option>
            </select>
          </label>
        </div>
        <div class="more" id="more-wrap">
          <button id="more-toggle" type="button">更多控制</button>
          <div class="more-panel" id="more-panel">
            <label class="control-chip">
              代码内容
              <select id="code">
                <option value="summary">讲作用</option>
                <option value="full">念原文</option>
              </select>
            </label>
            <div class="more-actions">
              <button id="refresh-page" type="button">刷新内容</button>
              <button id="pick-from-page" type="button" aria-pressed="false">页面定位</button>
              <button id="settings" type="button">声音设置</button>
            </div>
          </div>
        </div>
        <div class="preview-head">
          <span>接下来会听到</span>
          <span id="preview-meta">等待生成段落</span>
        </div>
        <div class="preview" id="preview"></div>
      </div>
    `;
    shadow.append(style, this.root);
    document.documentElement.append(this.host);

    this.status = this.root.querySelector('#status');
    this.preview = this.root.querySelector('#preview');
    this.codeSelect = this.root.querySelector('#code');
    this.engineSelect = this.root.querySelector('#engine');
    this.speedSelect = this.root.querySelector('#speed');
    this.playPauseButton = this.root.querySelector('#play-pause');
    this.currentTitleNode = this.root.querySelector('#current-title');
    this.positionNode = this.root.querySelector('#segment-position');
    this.stateBadgeNode = this.root.querySelector('#state-badge');
    this.progressFillNode = this.root.querySelector('#progress-fill');
    this.progressMetaNode = this.root.querySelector('#progress-meta');
    this.morePanel = this.root.querySelector('#more-wrap');
    this.modeButtons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-mode]'));

    this.root.querySelector<HTMLButtonElement>('#close')?.addEventListener('click', () => this.hide());
    this.root.querySelector<HTMLButtonElement>('#collapse')?.addEventListener('click', () => this.toggleCollapsed());
    this.root.querySelector<HTMLButtonElement>('#more-toggle')?.addEventListener('click', () => this.toggleMorePanel());
    this.root.querySelector<HTMLButtonElement>('#refresh-page')?.addEventListener('click', () => this.refreshPageContent());
    this.root.querySelector<HTMLButtonElement>('#pick-from-page')?.addEventListener('click', () => this.togglePageSelectionMode());
    this.playPauseButton?.addEventListener('click', () => void this.playPause());
    this.root.querySelector<HTMLButtonElement>('#prev')?.addEventListener('click', () => void this.advance(-1));
    this.root.querySelector<HTMLButtonElement>('#next')?.addEventListener('click', () => void this.advance(1));
    this.root
      .querySelector<HTMLButtonElement>('#settings')
      ?.addEventListener('click', () => void browser.runtime.sendMessage({ type: 'catchyread/open-options' } satisfies RuntimeMessage));
    this.modeButtons.forEach((button) =>
      button.addEventListener('click', () => {
        this.currentMode = (button.dataset.mode || 'smart') as ReadingMode;
        this.playbackState.mode = this.currentMode;
        this.renderPlaybackChrome();
        this.renderPreview();
      })
    );
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
        this.playbackState.rate = this.settings.playback.rate;
        if (this.currentSpeechEngine === 'remote' && this.remoteAudio.src) {
          this.remoteAudio.playbackRate = this.settings.playback.rate;
        }
        this.renderPlaybackChrome();
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
    this.renderPlaybackChrome();
  }

  private toggleMorePanel(): void {
    this.morePanel?.classList.toggle('open');
  }

  private setPlaybackStatus(status: PlaybackStatus): void {
    this.playbackState.status = status;
    this.renderPlaybackChrome();
  }

  private setNotice(notice: UserNotice, status?: PlaybackStatus): void {
    this.playbackState.notice = notice;
    if (status) {
      this.playbackState.status = status;
    }
    this.renderPlaybackChrome();
  }

  private formatSeconds(value?: number): string {
    if (!Number.isFinite(value)) {
      return '--:--';
    }
    const safeValue = Math.max(0, Math.floor(value || 0));
    const minutes = Math.floor(safeValue / 60);
    const seconds = safeValue % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  private renderPlaybackChrome(): void {
    const segments = this.currentSegments.length ? this.currentSegments : this.previewSource();
    const viewState = buildPlaybackViewState({
      segments,
      currentIndex: Math.min(this.currentIndex, Math.max(segments.length - 1, 0)),
      playbackStatus: this.playbackState.status,
      progressMode: this.playbackState.progressMode
    });
    const modePill = this.root?.querySelector<HTMLSpanElement>('#mode-pill');
    if (modePill) {
      modePill.textContent = this.currentMode === 'smart' ? '智能整理' : '原文直读';
    }
    this.modeButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === this.currentMode);
      button.setAttribute('aria-selected', String(button.dataset.mode === this.currentMode));
    });
    if (this.currentTitleNode) {
      this.currentTitleNode.textContent = viewState.currentTitle;
    }
    if (this.positionNode) {
      this.positionNode.textContent = viewState.positionLabel;
    }
    if (this.stateBadgeNode) {
      this.stateBadgeNode.textContent = viewState.statusLabel;
      const tone =
        this.playbackState.status === 'error'
          ? 'danger'
          : this.playbackState.status === 'playing'
            ? 'success'
            : this.playbackState.status === 'preparing'
              ? 'warning'
              : 'default';
      this.stateBadgeNode.dataset.tone = tone;
    }

    const totalSegments = segments.length;
    const currentNumber = totalSegments ? Math.min(this.currentIndex + 1, totalSegments) : 0;
    const segmentRatio = totalSegments ? currentNumber / totalSegments : 0;
    const mediaRatio =
      this.playbackState.progressMode === 'media-time' &&
      this.playbackState.durationSeconds &&
      this.playbackState.durationSeconds > 0
        ? (this.playbackState.currentTimeSeconds || 0) / this.playbackState.durationSeconds
        : undefined;
    const progressRatio = Math.max(0, Math.min(1, mediaRatio ?? segmentRatio));
    if (this.progressFillNode) {
      this.progressFillNode.style.width = `${Math.round(progressRatio * 100)}%`;
    }
    if (this.progressMetaNode) {
      const leftText = totalSegments ? `第 ${currentNumber} 段 / 共 ${totalSegments} 段` : '等待内容准备';
      const rightText =
        this.playbackState.progressMode === 'media-time'
          ? `${this.formatSeconds(this.playbackState.currentTimeSeconds)} / ${this.formatSeconds(this.playbackState.durationSeconds)}`
          : this.currentSpeechEngine === 'remote'
            ? '远端 TTS'
            : '浏览器语音';
      this.progressMetaNode.innerHTML = `<span>${leftText}</span><span>${rightText}</span>`;
    }

    if (this.playPauseButton) {
      const label =
        this.playbackState.status === 'preparing'
          ? '准备中…'
          : this.playbackState.status === 'playing'
            ? '暂停'
            : this.playbackState.status === 'paused'
              ? '继续播放'
              : totalSegments
                ? '从这里开始'
                : '开始收听';
      this.updatePlayPauseLabel(label);
      this.playPauseButton.disabled = this.playbackState.status === 'preparing';
    }

    const pickButton = this.root?.querySelector<HTMLButtonElement>('#pick-from-page');
    if (pickButton) {
      pickButton.hidden = !viewState.showPagePicker;
    }

    if (this.status) {
      const notice =
        this.playbackState.notice ||
        ({
          category: 'info',
          title: '准备就绪',
          message: '',
          recommendedAction: ''
        } satisfies UserNotice);
      const tone =
        notice.category === 'success'
          ? 'success'
          : ['permission-denied', 'network', 'provider-rejected', 'invalid-response', 'audio-playback', 'browser-unsupported', 'unknown'].includes(
                notice.category
              )
            ? 'danger'
            : 'default';
      this.status.dataset.tone = tone;
      this.status.classList.toggle(
        'compact',
        !['permission-denied', 'network', 'provider-rejected', 'invalid-response', 'audio-playback', 'browser-unsupported', 'unknown'].includes(
          notice.category
        )
      );
      this.status.innerHTML = `
        <div class="notice-title">${notice.title}</div>
        ${notice.message ? `<div class="notice-body">${notice.message}</div>` : ''}
        ${notice.recommendedAction ? `<div class="notice-action">${notice.recommendedAction}</div>` : ''}
        ${
          notice.debugDetails
            ? `<details><summary>查看调试信息</summary><div>${notice.debugDetails}</div></details>`
            : ''
        }
      `;
    }
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
    this.root?.classList.toggle('collapsed', !model.showQueue);
    const collapseButton = this.root?.querySelector<HTMLButtonElement>('#collapse');
    if (collapseButton) {
      collapseButton.textContent = model.collapseButtonLabel;
      collapseButton.setAttribute('aria-expanded', String(model.showQueue));
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
    this.codeSelect && (this.codeSelect.value = this.currentCodeStrategy);
    this.engineSelect && (this.engineSelect.value = this.currentSpeechEngine);
    this.speedSelect && (this.speedSelect.value = String(result.settings.playback.rate));
    this.playbackState = {
      ...this.playbackState,
      rate: result.settings.playback.rate,
      voiceId: result.settings.providers.tts.voiceId || 'default',
      mode: this.currentMode,
      speechEngine: this.currentSpeechEngine
    };
    this.applyCollapsedState(result.settings.ui.collapsed, false);
    if (this.host && result.settings.ui.x !== null && result.settings.ui.y !== null) {
      this.host.style.left = `${result.settings.ui.x}px`;
      this.host.style.top = `${result.settings.ui.y}px`;
      this.host.style.right = 'auto';
      this.host.style.bottom = 'auto';
    }
    this.renderPlaybackChrome();
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
      this.setNotice(
        buildSuccessNotice(
          '内容已准备好',
          `这页已经重新整理完成，共识别到 ${this.snapshot.structuredBlocks.length} 个结构块。`,
          '现在可以直接开始收听，或先定位到想听的段落。'
        )
      );
    }
  }

  private markPageStale(): void {
    if (!this.open) {
      return;
    }
    this.pageSnapshotStale = true;
    this.setNotice({
      category: 'info',
      title: '页面内容变了',
      message: '当前网页已经更新，现有段落可能不是最新内容。',
      recommendedAction: '点一下“刷新内容”，再继续听后面的段落。'
    });
    this.renderPreview();
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
      this.setNotice({
        category: 'browser-unsupported',
        title: '拖拽能力受限',
        message: '当前位置仍可继续使用，只是暂时不能自由拖动播放器。',
        recommendedAction: '继续收听即可；如果需要拖拽，请换到支持 Pointer Events 的浏览器。'
      });
    }
  }

  private async start(mode: ReadingMode, startIndex = 0): Promise<void> {
    if (!this.settings || !this.snapshot) {
      return;
    }
    this.currentMode = mode;
    this.playbackState.mode = mode;
    this.setPlaybackStatus('preparing');
    this.renderPlaybackChrome();
    if (mode === 'smart') {
      if (!isProviderConfigured(this.settings.providers.llm)) {
        this.fail(new Error('智能模式需要先配置 LLM，且不会偷偷回退。'));
        return;
      }
      this.setNotice({
        category: 'info',
        title: '正在整理重点',
        message: 'CatchyRead 正在把这页内容整理成更适合听的节奏。',
        recommendedAction: '稍等片刻，整理完成后会自动开始播放。'
      });
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
        this.fail(error);
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
        this.setPlaybackStatus('paused');
        return;
      }
      if (this.remoteAudio.src && this.remoteAudio.paused) {
        await this.remoteAudio.play();
        this.speaking = true;
        this.setPlaybackStatus('playing');
        return;
      }
    } else {
      const browserSpeechAction = resolveBrowserSpeechAction({
        hasActiveUtterance: Boolean(this.browserSpeechUtterance),
        isPaused: this.browserSpeechPaused
      });

      if (browserSpeechAction === 'resume') {
        speechSynthesis.resume();
        this.browserSpeechPaused = false;
        this.speaking = true;
        this.setPlaybackStatus('playing');
        return;
      }

      if (browserSpeechAction === 'pause') {
        speechSynthesis.pause();
        this.browserSpeechPaused = true;
        this.speaking = false;
        this.setPlaybackStatus('paused');
        return;
      }
    }

    await this.playCurrent();
  }

  private async playCurrent(): Promise<void> {
    const segment = this.currentSegments[this.currentIndex];
    if (!segment || !this.settings) {
      this.setNotice({
        category: 'incomplete-config',
        title: '还没有可听内容',
        message: '当前没有生成可朗读的段落，所以播放器还不能继续。',
        recommendedAction: '先刷新内容或切换模式，再点“开始收听”。',
        canRetry: true
      });
      return;
    }

    this.stopAll();
    this.highlight(segment);
    this.playbackState.currentSegmentId = segment.id;
    this.playbackState.currentIndex = this.currentIndex;
    this.playbackState.totalSegments = this.currentSegments.length;
    this.playbackState.rate = this.settings.playback.rate;
    this.playbackState.voiceId = this.settings.providers.tts.voiceId || 'default';
    this.setNotice({
      category: 'info',
      title: '正在继续播放',
      message: `当前会先讲「${segment.sectionTitle}」。`,
      recommendedAction: '如果想换起点，可以直接点下面的段落队列。'
    });
    this.setPlaybackStatus('preparing');

    if (this.currentSpeechEngine === 'remote') {
      if (!isProviderConfigured(this.settings.providers.tts)) {
        this.fail(new Error('远端 TTS 未配置，请切换到浏览器语音或先填写设置。'));
        return;
      }
      try {
        this.playbackState.progressMode = 'media-time';
        this.playbackState.currentTimeSeconds = 0;
        this.playbackState.durationSeconds = undefined;
        const objectUrl = await this.getRemoteAudioUrlForIndex(this.currentIndex);
        this.remoteAudio.src = objectUrl;
        this.remoteAudio.playbackRate = this.settings.playback.rate;
        await this.remoteAudio.play();
        this.speaking = true;
        void this.prefetchRemoteAudio(this.currentIndex + 1);
        return;
      } catch (error) {
        this.fail(error);
        return;
      }
    }

    this.playbackState.progressMode = 'segment-only';
    const utterance = new SpeechSynthesisUtterance(segment.spokenText);
    const browserSpeechToken = this.browserSpeechToken + 1;
    this.browserSpeechToken = browserSpeechToken;
    this.browserSpeechUtterance = utterance;
    this.browserSpeechPaused = false;
    utterance.lang = this.snapshot?.language || 'zh-CN';
    utterance.rate = this.settings.playback.rate;
    utterance.onpause = () => {
      if (this.browserSpeechToken !== browserSpeechToken) {
        return;
      }
      this.browserSpeechPaused = true;
    };
    utterance.onresume = () => {
      if (this.browserSpeechToken !== browserSpeechToken) {
        return;
      }
      this.browserSpeechPaused = false;
    };
    utterance.onend = () => {
      if (this.browserSpeechToken !== browserSpeechToken) {
        return;
      }
      this.browserSpeechUtterance = null;
      this.browserSpeechPaused = false;
      this.speaking = false;
      this.setPlaybackStatus('idle');
      void this.advance(1);
    };
    utterance.onerror = (event) => {
      if (this.browserSpeechToken !== browserSpeechToken) {
        return;
      }
      if (shouldIgnoreSpeechSynthesisError(event)) {
        return;
      }
      this.browserSpeechUtterance = null;
      this.browserSpeechPaused = false;
      this.fail(new Error('浏览器语音播放失败。'));
    };
    speechSynthesis.cancel();
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
    }
    speechSynthesis.speak(utterance);
    this.speaking = true;
    this.setPlaybackStatus('playing');
  }

  private async advance(step: number): Promise<void> {
    if (!this.currentSegments.length) {
      return;
    }

    const nextIndex = this.currentIndex + step;
    if (nextIndex < 0) {
      this.currentIndex = 0;
      this.renderPreview();
      this.setNotice({
        category: 'info',
        title: '已经是第一段',
        message: '没有更早的内容了，当前就从这里开始。',
        recommendedAction: '可以直接播放，或者切到后面的段落。'
      });
      return;
    }
    if (nextIndex >= this.currentSegments.length) {
      this.stopAll();
      this.currentIndex = this.currentSegments.length - 1;
      this.renderPreview();
      this.setNotice(
        buildSuccessNotice('已经听到最后', '这一页的段落已经播放到结尾。', '如果还想重听，直接点任意段落即可。')
      );
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
    this.browserSpeechToken += 1;
    this.browserSpeechUtterance = null;
    this.browserSpeechPaused = false;
    speechSynthesis.cancel();
    this.speaking = false;
    this.playbackState.currentTimeSeconds = undefined;
    this.playbackState.durationSeconds = undefined;
    this.renderPlaybackChrome();
  }

  private setStatus(message: string, isError = false): void {
    if (isError) {
      this.setNotice(mapErrorToNotice(new Error(message), { surface: 'player', action: 'playback' }), 'error');
      return;
    }
      this.setNotice({
        category: 'info',
        title: '下一步',
        message,
        recommendedAction: '点中间按钮继续。'
      });
  }

  private fail(message: unknown): void {
    this.stopAll();
    this.cacheRegistry.clearGroup('remote-audio');
    this.setNotice(mapErrorToNotice(message, { surface: 'player', action: 'playback' }), 'error');
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
    const viewState = buildPlaybackViewState({
      segments,
      currentIndex: this.currentIndex,
      playbackStatus: this.playbackState.status,
      progressMode: this.playbackState.progressMode
    });
    this.preview.innerHTML = '';
    this.preview.setAttribute('role', 'listbox');
    const previewMeta = this.root?.querySelector<HTMLSpanElement>('#preview-meta');
    if (previewMeta) {
      previewMeta.textContent = this.pageSnapshotStale ? '内容已变更，建议刷新' : `共 ${segments.length} 段`;
      previewMeta.classList.toggle('stale-tip', this.pageSnapshotStale);
    }
    if (this.pageSnapshotStale) {
      this.preview.dataset.stale = 'true';
    } else {
      delete this.preview.dataset.stale;
    }
    viewState.previewItems.forEach((item, index) => {
      const button = renderPreviewButton(document, item, this.currentIndex, index);
      button.addEventListener('click', () => {
        this.currentSegments = segments;
        this.currentIndex = index;
        this.renderPreview();
        button.focus();
        if (this.speaking) {
          void this.playCurrent();
        } else {
          this.setNotice({
            category: 'info',
            title: '起点已经换好',
            message: `下一次播放会从「${item.title}」开始。`,
            recommendedAction: '现在点“开始收听”即可。'
          });
        }
      });
      this.preview?.append(button);
    });
    this.renderPlaybackChrome();
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
        this.setNotice({
          category: 'info',
          title: '已定位',
          message: '新的起点已经选好。',
          recommendedAction: '现在点“开始收听”。'
        });
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
    this.setNotice(
      this.pageSelectionMode
        ? {
            category: 'info',
            title: '选择起点',
            message: '点击正文任意一段。',
            recommendedAction: '选好后回来播放。'
          }
        : {
            category: 'info',
            title: '已退出定位',
            message: '已回到正常收听模式。',
            recommendedAction: '现在可以直接播放。'
          }
    );
  }

  private setPageSelectionMode(enabled: boolean): void {
    this.pageSelectionMode = enabled;
    const button = this.root?.querySelector<HTMLButtonElement>('#pick-from-page');
    if (button) {
      button.setAttribute('aria-pressed', String(enabled));
      button.textContent = enabled ? '退出定位' : '页面定位';
    }
    if (enabled) {
      this.morePanel?.classList.remove('open');
    }
    this.renderPlaybackChrome();
  }

  private onRootKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.pageSelectionMode) {
        event.preventDefault();
        this.setPageSelectionMode(false);
        this.setNotice({
          category: 'info',
          title: '已退出页面定位',
          message: '你可以继续在播放器里选择段落，或直接播放。',
          recommendedAction: '若想重新定位，稍后再打开“页面定位”。'
        });
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
