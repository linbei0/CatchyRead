import type { CodeStrategy, ReadingMode, SpeechEngine, UserNotice } from '@/shared/types';
import type { PreviewItemViewState } from '@/domain/playback/player-view-state';
import { renderPreviewButton } from '@/ui/content/player-markup';
import { renderPlayerIcon, type PlayerIconName } from '@/ui/content/player-icons';
import { getCollapsedVisibilityModel } from '@/ui/content/player-ui-state';

export const PLAYER_HOST_ID = 'catchyread-player-host';

type PlayerViewHandlers = {
  close?: () => void;
  collapse?: () => void;
  more?: () => void;
  refresh?: () => void;
  pageSelection?: () => void;
  playPause?: () => void;
  previous?: () => void;
  next?: () => void;
  openSettings?: () => void;
  modeChange?: (mode: ReadingMode) => void;
  codeStrategyChange?: (codeStrategy: CodeStrategy) => void;
  speechEngineChange?: (speechEngine: SpeechEngine) => void;
  rateChange?: (rate: number) => void;
  previewSelect?: (index: number) => void;
  keydown?: (event: KeyboardEvent) => void;
};

function findElement<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) {
    throw new Error(`播放器视图缺少节点：${selector}`);
  }
  return node;
}

function iconOnlyButton(id: string, icon: PlayerIconName, label: string, extraClass = ''): string {
  return `
    <button id="${id}" class="${extraClass}" type="button" aria-label="${label}" title="${label}">
      ${renderPlayerIcon(icon)}
      <span class="sr-only">${label}</span>
    </button>
  `;
}

function compactActionButton(id: string, icon: PlayerIconName, label: string): string {
  return `
    <button id="${id}" class="compact-action" type="button" aria-label="${label}" title="${label}">
      ${renderPlayerIcon(icon)}
      <span>${label}</span>
    </button>
  `;
}

function controlField(
  icon: PlayerIconName,
  label: string,
  selectId: string,
  options: Array<{ value: string; label: string }>
): string {
  return `
    <label class="control-field">
      <span class="control-label">
        ${renderPlayerIcon(icon)}
        <span>${label}</span>
      </span>
      <select id="${selectId}">
        ${options.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
      </select>
    </label>
  `;
}

function createTemplate(documentRef: Document): HTMLDivElement {
  const root = documentRef.createElement('div');
  root.innerHTML = `
    <div class="panel">
      <div class="topbar">
        <div class="brand">
          <span class="eyebrow">CatchyRead</span>
          <h2 class="title">正在收听</h2>
        </div>
        <div class="toolbar-actions">
          <span class="mode-pill" id="mode-pill">智能整理</span>
          ${iconOnlyButton('collapse', 'collapse', '折叠', 'toolbar-icon')}
          ${iconOnlyButton('close', 'close', '关闭', 'toolbar-icon danger')}
        </div>
      </div>

      <section class="collapsed-strip">
        <div class="collapsed-meta">
          <span class="state-badge" id="collapsed-state-badge">待开始</span>
          <span id="collapsed-position">00 / 00</span>
        </div>
        <strong id="collapsed-title">还没有开始收听</strong>
      </section>

      <section class="hero">
        <div class="hero-row hero-row-top">
          <div class="mode-switch" role="tablist" aria-label="朗读模式">
            <button class="active" data-mode="smart" type="button">智能整理</button>
            <button data-mode="original" type="button">原文直读</button>
          </div>
          <div class="status-meta">
            <span class="state-badge" id="state-badge">待开始</span>
            <span id="segment-position">00 / 00</span>
          </div>
        </div>
        <div class="headline-stack">
          <h3 id="current-title">还没有开始收听</h3>
          <div class="notice compact" id="status"></div>
        </div>
        <div class="progress">
          <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
          <div class="progress-meta" id="progress-meta"><span>准备就绪</span><span>等待开始</span></div>
        </div>
      </section>

      <div class="transport" role="group" aria-label="主播放控制">
        ${iconOnlyButton('prev', 'previous', '上一段', 'transport-button')}
        ${iconOnlyButton('play-pause', 'play', '开始收听', 'transport-button primary')}
        ${iconOnlyButton('next', 'next', '下一段', 'transport-button')}
      </div>

      <section class="preview-shell">
        <div class="preview-head">
          <span class="preview-label">接下来</span>
          <div class="preview-toolbar">
            ${iconOnlyButton('preview-prev', 'chevron-left', '上一条预告', 'preview-nav')}
            <span id="preview-meta">00 / 00</span>
            ${iconOnlyButton('preview-next', 'chevron-right', '下一条预告', 'preview-nav')}
          </div>
        </div>
        <div class="preview" id="preview"></div>
      </section>

      <div class="secondary-controls">
        ${compactActionButton('refresh-page', 'refresh', '刷新')}
        ${compactActionButton('pick-from-page', 'locate', '定位')}
        ${compactActionButton('settings', 'settings', '设置')}
        <div class="more" id="more-wrap">
          ${compactActionButton('more-toggle', 'more', '更多')}
          <div class="more-panel">
            <div class="more-grid">
              ${controlField('remote', '语音引擎', 'engine', [
                { value: 'browser', label: '浏览器语音' },
                { value: 'remote', label: '远端 TTS' }
              ])}
              ${controlField('speed', '倍速', 'speed', [
                { value: '0.9', label: '0.9x' },
                { value: '1', label: '1.0x' },
                { value: '1.2', label: '1.2x' },
                { value: '1.4', label: '1.4x' },
                { value: '1.6', label: '1.6x' }
              ])}
              ${controlField('code', '代码内容', 'code', [
                { value: 'summary', label: '讲作用' },
                { value: 'full', label: '念原文' },
                { value: 'skip', label: '直接跳过' }
              ])}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  return root;
}

function renderIconLabel(icon: PlayerIconName, label: string): string {
  return `${renderPlayerIcon(icon)}<span>${label}</span>`;
}

function renderVisuallyHiddenLabel(label: string): string {
  return `<span class="sr-only">${label}</span>`;
}

function resolvePlayPauseIcon(label: string): PlayerIconName {
  return label.includes('暂停') ? 'pause' : 'play';
}

export function buildPlayerViewCss(): string {
  return `
    :host { all: initial; font-family: Inter, "Segoe UI", "PingFang SC", sans-serif; color: #f5f7fb; }
    *, *::before, *::after { box-sizing: border-box; }
    button, select { font: inherit; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    .panel {
      width: min(392px, calc(100vw - 24px));
      height: min(680px, calc(100vh - 16px));
      overflow: clip;
      position: relative;
      display: grid;
      grid-template-rows: auto auto auto auto auto;
      gap: 10px;
      border-radius: 26px;
      padding: 14px;
      color: #f5f7fb;
      background: linear-gradient(180deg, rgba(18, 22, 32, .98), rgba(10, 14, 22, .98));
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: 0 18px 52px rgba(0,0,0,.38);
    }
    .topbar, .toolbar-actions, .hero-row, .status-meta, .preview-head, .preview-toolbar, .secondary-controls { display: flex; align-items: center; }
    .topbar { justify-content: space-between; gap: 12px; cursor: move; }
    .brand { display: grid; gap: 2px; min-width: 0; }
    .eyebrow { color: #f5b56f; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; }
    .title, h3 { margin: 0; }
    .title { font-size: 18px; line-height: 1.1; }
    .toolbar-actions { gap: 8px; }
    .mode-pill, .state-badge {
      display: inline-flex; align-items: center; min-height: 28px; padding: 0 10px; border-radius: 999px;
      font-size: 12px; background: rgba(245,181,111,.12); color: #ffd59f;
    }
    button {
      cursor: pointer;
      min-height: 38px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 16px;
      padding: 8px 12px;
      color: #f5f7fb;
      background: rgba(255,255,255,.035);
      transition: background .16s ease, border-color .16s ease, transform .16s ease, color .16s ease;
    }
    button:hover { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.18); }
    button:active { transform: translateY(1px); }
    button:focus-visible, select:focus-visible { outline: 2px solid rgba(245,181,111,.66); outline-offset: 2px; }
    button:disabled { cursor: wait; opacity: .58; }
    .icon { width: 18px; height: 18px; flex: none; }
    .toolbar-icon, .preview-nav {
      width: 38px; height: 38px; min-height: 38px; padding: 0; border-radius: 14px;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .toolbar-icon.danger { color: #ffd2cc; }
    .collapsed-strip {
      display: none;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 18px;
      background: rgba(255,255,255,.03);
      border: 1px solid rgba(255,255,255,.06);
    }
    .collapsed-meta { display: flex; justify-content: space-between; gap: 8px; align-items: center; color: #aeb6c7; font-size: 12px; }
    #collapsed-title { font-size: 16px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hero {
      display: grid; gap: 10px;
      padding: 14px;
      border-radius: 20px;
      background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.025));
      border: 1px solid rgba(255,255,255,.06);
    }
    .hero-row-top { justify-content: space-between; gap: 12px; }
    .mode-switch {
      display: inline-grid; grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px; padding: 4px; border-radius: 999px;
      background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
      min-width: 0; flex: 1 1 auto;
    }
    .mode-switch button {
      min-height: 36px; border: 0; border-radius: 999px; padding: 0 12px;
      background: transparent; color: #b8c0d4;
    }
    .mode-switch button.active { color: #1d1307; background: linear-gradient(135deg, #f5b56f, #ffd59f); font-weight: 700; }
    .status-meta { gap: 8px; justify-content: flex-end; color: #aeb6c7; font-size: 12px; white-space: nowrap; }
    .state-badge[data-tone="success"] { background: rgba(134,211,158,.14); color: #9fe0b5; }
    .state-badge[data-tone="warning"] { background: rgba(245,181,111,.16); color: #ffd59f; }
    .state-badge[data-tone="danger"] { background: rgba(255,139,123,.16); color: #ffb5a9; }
    .headline-stack { display: grid; gap: 8px; min-height: 72px; }
    #current-title { font-size: 24px; line-height: 1.1; letter-spacing: -.03em; text-wrap: balance; }
    .notice {
      display: grid; gap: 4px; min-height: 44px; padding: 10px 12px;
      border-radius: 16px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06);
    }
    .notice.compact { align-content: center; }
    .notice[data-tone="danger"] { border-color: rgba(255,139,123,.28); background: rgba(255,139,123,.08); }
    .notice[data-tone="success"] { border-color: rgba(134,211,158,.24); background: rgba(134,211,158,.08); }
    .notice-title { font-size: 13px; font-weight: 600; }
    .notice-body, .notice-action, details { font-size: 12px; color: #c7cede; }
    .progress { display: grid; gap: 6px; }
    .progress-track { height: 7px; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,.08); }
    .progress-fill { height: 100%; width: 0%; border-radius: inherit; background: linear-gradient(90deg, #f5b56f, #ffd59f); }
    .progress-meta { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: #aab3c4; }
    .transport { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .transport-button {
      min-height: 56px; border-radius: 20px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,.04);
    }
    .transport-button .icon { width: 24px; height: 24px; }
    .transport-button.primary {
      background: linear-gradient(135deg, #f5b56f, #ffd59f);
      color: #1d1307; border-color: transparent;
      box-shadow: 0 10px 20px rgba(245,181,111,.24);
    }
    .preview-shell {
      display: grid; gap: 8px; padding-top: 2px;
      border-top: 1px solid rgba(255,255,255,.06);
    }
    .preview-head { justify-content: space-between; gap: 10px; min-height: 32px; }
    .preview-label { font-size: 12px; color: #9ea8bc; text-transform: uppercase; letter-spacing: .12em; }
    .preview-toolbar { gap: 6px; color: #aeb7c8; font-size: 12px; }
    .preview {
      min-height: 70px;
      display: grid;
      align-items: stretch;
    }
    .preview button {
      width: 100%;
      text-align: left;
      display: grid;
      gap: 4px;
      padding: 12px 14px;
      border-radius: 18px;
      border-left: 3px solid transparent;
      background: rgba(255,255,255,.03);
    }
    .preview button[data-tone="main"] { border-left-color: rgba(245,181,111,.58); }
    .preview button[data-tone="warning"] { border-left-color: rgba(240,198,106,.8); }
    .preview button[data-tone="code"] { border-left-color: rgba(126,179,255,.8); }
    .preview button.active { background: rgba(255,255,255,.07); border-color: rgba(245,181,111,.2); }
    .preview small, .preview strong, .preview span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .preview small { color: #97a0b4; font-size: 11px; text-transform: uppercase; }
    .preview strong { font-size: 16px; line-height: 1.2; }
    .preview span { color: #c3cad9; font-size: 12px; }
    .secondary-controls {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      border-top: 1px solid rgba(255,255,255,.06);
      padding-top: 10px;
    }
    .compact-action {
      width: 100%;
      min-height: 36px; padding: 0 10px; border-radius: 14px;
      display: inline-flex; align-items: center; gap: 8px;
      justify-content: center;
      color: #dfe5f1;
    }
    .compact-action span { min-width: 0; font-size: 12px; white-space: nowrap; }
    .more { position: relative; }
    .more > .compact-action { width: 100%; justify-content: center; }
    select {
      width: 100%;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.12);
      padding: 10px 12px;
      color: #f5f7fb;
      background: rgba(255,255,255,.05);
      color-scheme: dark;
    }
    option { color: #111827; background: #f8fafc; }
    .more-panel {
      position: absolute;
      right: 0;
      bottom: calc(100% + 10px);
      z-index: 2;
      width: min(320px, calc(100vw - 48px));
      display: none;
      padding: 12px;
      border-radius: 18px;
      background: rgba(11, 16, 25, .98);
      border: 1px solid rgba(255,255,255,.1);
      box-shadow: 0 18px 40px rgba(0,0,0,.36);
    }
    .more.open .more-panel { display: block; }
    .more-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .more-grid .control-field:last-child { grid-column: 1 / -1; }
    .control-field { display: grid; gap: 6px; }
    .control-label {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; color: #aeb7c8;
    }
    .control-label .icon { width: 16px; height: 16px; }
    .stale-tip { color: #f0c66a; }
    .collapsed .hero, .collapsed .preview-shell, .collapsed .secondary-controls { display: none; }
    .collapsed .collapsed-strip { display: grid; }
    .collapsed .panel { height: auto; grid-template-rows: auto auto auto; gap: 10px; }
    .collapsed .transport { grid-template-columns: repeat(3, minmax(0, 72px)); justify-content: space-between; }
    .collapsed .transport-button { min-height: 50px; border-radius: 16px; }
  `;
}

function createStyle(documentRef: Document): HTMLStyleElement {
  const style = documentRef.createElement('style');
  style.textContent = buildPlayerViewCss();
  return style;
}

export class PlayerView {
  private host: HTMLDivElement | null = null;
  private root: HTMLDivElement | null = null;
  private preview: HTMLDivElement | null = null;
  private handlers: PlayerViewHandlers = {};

  constructor(private readonly documentRef: Document) {}

  mount(): void {
    if (this.host) {
      return;
    }

    this.host = this.documentRef.createElement('div');
    this.host.id = PLAYER_HOST_ID;
    Object.assign(this.host.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      display: 'none'
    });
    const shadow = this.host.attachShadow({ mode: 'open' });
    this.root = createTemplate(this.documentRef);
    shadow.append(createStyle(this.documentRef), this.root);
    this.documentRef.documentElement.append(this.host);

    this.preview = findElement<HTMLDivElement>(this.root, '#preview');
    findElement<HTMLButtonElement>(this.root, '#close').addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.handlers.close?.();
    });
    findElement<HTMLButtonElement>(this.root, '#collapse').addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestAnimationFrame(() => this.handlers.collapse?.());
    });
    findElement<HTMLButtonElement>(this.root, '#more-toggle').addEventListener('click', () => this.handlers.more?.());
    findElement<HTMLButtonElement>(this.root, '#refresh-page').addEventListener('click', () => this.handlers.refresh?.());
    findElement<HTMLButtonElement>(this.root, '#pick-from-page').addEventListener('click', () => this.handlers.pageSelection?.());
    findElement<HTMLButtonElement>(this.root, '#play-pause').addEventListener('click', () => this.handlers.playPause?.());
    findElement<HTMLButtonElement>(this.root, '#prev').addEventListener('click', () => this.handlers.previous?.());
    findElement<HTMLButtonElement>(this.root, '#next').addEventListener('click', () => this.handlers.next?.());
    findElement<HTMLButtonElement>(this.root, '#settings').addEventListener('click', () => this.handlers.openSettings?.());
    findElement<HTMLButtonElement>(this.root, '#preview-prev').addEventListener('click', () => {
      const currentIndex = Number(this.preview?.dataset.currentIndex || '0');
      if (currentIndex > 0) {
        this.handlers.previewSelect?.(currentIndex - 1);
      }
    });
    findElement<HTMLButtonElement>(this.root, '#preview-next').addEventListener('click', () => {
      const currentIndex = Number(this.preview?.dataset.currentIndex || '0');
      const totalCount = Number(this.preview?.dataset.totalCount || '0');
      if (currentIndex < totalCount - 1) {
        this.handlers.previewSelect?.(currentIndex + 1);
      }
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) =>
      button.addEventListener('click', () => {
        const mode = button.dataset.mode;
        if (mode === 'smart' || mode === 'original') {
          this.handlers.modeChange?.(mode);
        }
      })
    );
    findElement<HTMLSelectElement>(this.root, '#code').addEventListener('change', (event) => {
      const value = (event.target as HTMLSelectElement).value;
      if (value === 'summary' || value === 'full' || value === 'skip') {
        this.handlers.codeStrategyChange?.(value);
      }
    });
    findElement<HTMLSelectElement>(this.root, '#engine').addEventListener('change', (event) => {
      const value = (event.target as HTMLSelectElement).value;
      if (value === 'browser' || value === 'remote') {
        this.handlers.speechEngineChange?.(value);
      }
    });
    findElement<HTMLSelectElement>(this.root, '#speed').addEventListener('change', (event) => {
      this.handlers.rateChange?.(Number((event.target as HTMLSelectElement).value));
    });
    this.preview.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest<HTMLButtonElement>('button[data-index]');
      if (button) {
        this.handlers.previewSelect?.(Number(button.dataset.index || 0));
      }
    });
    this.root.addEventListener('keydown', (event) => this.handlers.keydown?.(event));
  }

  on(event: keyof PlayerViewHandlers, handler: PlayerViewHandlers[keyof PlayerViewHandlers]): void {
    this.handlers[event] = handler as never;
  }

  show(): void {
    this.mount();
    if (this.host) {
      this.host.style.display = 'block';
    }
  }

  hide(): void {
    if (this.host) {
      this.host.style.display = 'none';
    }
  }

  getHost(): HTMLDivElement | null {
    return this.host;
  }

  getRoot(): HTMLDivElement | null {
    return this.root;
  }

  getPreviewButtons(): HTMLButtonElement[] {
    return Array.from(this.preview?.querySelectorAll<HTMLButtonElement>('button') || []);
  }

  focusPreview(): void {
    this.getPreviewButtons()[0]?.focus();
  }

  toggleMorePanel(): void {
    this.root?.querySelector('#more-wrap')?.classList.toggle('open');
  }

  closeMorePanel(): void {
    this.root?.querySelector('#more-wrap')?.classList.remove('open');
  }

  setMode(mode: ReadingMode): void {
    const modePill = this.root?.querySelector<HTMLSpanElement>('#mode-pill');
    if (modePill) {
      modePill.textContent = mode === 'smart' ? '智能整理' : '原文直读';
    }
    this.root?.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === mode);
      button.setAttribute('aria-selected', String(button.dataset.mode === mode));
    });
  }

  setControls(args: { codeStrategy: CodeStrategy; speechEngine: SpeechEngine; rate: number; browserTtsAvailable: boolean }): void {
    const codeSelect = this.root?.querySelector<HTMLSelectElement>('#code');
    const engineSelect = this.root?.querySelector<HTMLSelectElement>('#engine');
    const speedSelect = this.root?.querySelector<HTMLSelectElement>('#speed');
    if (codeSelect) {
      codeSelect.value = args.codeStrategy;
    }
    if (engineSelect) {
      engineSelect.value = args.speechEngine;
      const browserOption = engineSelect.querySelector<HTMLOptionElement>('option[value="browser"]');
      if (browserOption) {
        browserOption.disabled = !args.browserTtsAvailable;
        browserOption.textContent = args.browserTtsAvailable ? '浏览器语音' : '浏览器语音（当前不可用）';
      }
    }
    if (speedSelect) {
      speedSelect.value = String(args.rate);
    }
  }

  setCollapsed(collapsed: boolean): void {
    const model = getCollapsedVisibilityModel(collapsed);
    this.root?.classList.toggle('collapsed', !model.showQueue);
    const button = this.root?.querySelector<HTMLButtonElement>('#collapse');
    if (button) {
      const icon = model.showQueue ? 'collapse' : 'expand';
      button.innerHTML = `${renderPlayerIcon(icon)}${renderVisuallyHiddenLabel(model.collapseButtonLabel)}`;
      button.setAttribute('aria-expanded', String(model.showQueue));
      button.setAttribute('aria-label', model.collapseButtonLabel);
      button.title = model.collapseButtonLabel;
    }
  }

  setPosition(x: number | null, y: number | null): void {
    if (!this.host || x === null || y === null) {
      return;
    }
    this.host.style.left = `${x}px`;
    this.host.style.top = `${y}px`;
    this.host.style.right = 'auto';
    this.host.style.bottom = 'auto';
  }

  setHeadline(title: string, positionLabel: string, statusLabel: string, tone: 'default' | 'success' | 'warning' | 'danger'): void {
    const currentTitle = this.root?.querySelector<HTMLHeadingElement>('#current-title');
    const position = this.root?.querySelector<HTMLSpanElement>('#segment-position');
    const badge = this.root?.querySelector<HTMLSpanElement>('#state-badge');
    const collapsedTitle = this.root?.querySelector<HTMLElement>('#collapsed-title');
    const collapsedPosition = this.root?.querySelector<HTMLElement>('#collapsed-position');
    const collapsedBadge = this.root?.querySelector<HTMLElement>('#collapsed-state-badge');
    if (currentTitle) {
      currentTitle.textContent = title;
      currentTitle.title = title;
    }
    if (collapsedTitle) {
      collapsedTitle.textContent = title;
      collapsedTitle.setAttribute('title', title);
    }
    if (position) {
      position.textContent = positionLabel;
    }
    if (collapsedPosition) {
      collapsedPosition.textContent = positionLabel;
    }
    if (badge) {
      badge.textContent = statusLabel;
      badge.dataset.tone = tone;
    }
    if (collapsedBadge) {
      collapsedBadge.textContent = statusLabel;
      collapsedBadge.dataset.tone = tone;
    }
  }

  setProgress(percent: number, leftText: string, rightText: string): void {
    const fill = this.root?.querySelector<HTMLDivElement>('#progress-fill');
    const meta = this.root?.querySelector<HTMLDivElement>('#progress-meta');
    if (fill) {
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, percent)) * 100)}%`;
    }
    if (meta) {
      meta.replaceChildren();
      const left = this.documentRef.createElement('span');
      left.textContent = leftText;
      const right = this.documentRef.createElement('span');
      right.textContent = rightText;
      meta.append(left, right);
    }
  }

  setPlayPause(label: string, disabled: boolean): void {
    const button = this.root?.querySelector<HTMLButtonElement>('#play-pause');
    if (button) {
      button.innerHTML = `${renderPlayerIcon(resolvePlayPauseIcon(label), 'icon')}${renderVisuallyHiddenLabel(label)}`;
      button.disabled = disabled;
      button.setAttribute('aria-label', label);
      button.title = label;
    }
  }

  setPageSelectionButton(enabled: boolean, hidden: boolean): void {
    const button = this.root?.querySelector<HTMLButtonElement>('#pick-from-page');
    if (!button) {
      return;
    }
    button.hidden = hidden;
    const label = enabled ? '退出定位' : '定位';
    button.innerHTML = renderIconLabel('locate', label);
    button.setAttribute('aria-label', label);
    button.title = label;
    button.setAttribute('aria-pressed', String(enabled));
  }

  renderNotice(notice: UserNotice): void {
    const status = this.root?.querySelector<HTMLDivElement>('#status');
    if (!status) {
      return;
    }
    const dangerCategories = ['permission-denied', 'network', 'provider-rejected', 'invalid-response', 'audio-playback', 'browser-unsupported', 'unknown'];
    status.dataset.tone = notice.category === 'success' ? 'success' : dangerCategories.includes(notice.category) ? 'danger' : 'default';
    status.classList.toggle('compact', !dangerCategories.includes(notice.category));
    status.innerHTML = `
      <div class="notice-title">${notice.title}</div>
      ${notice.message ? `<div class="notice-body">${notice.message}</div>` : ''}
      ${notice.recommendedAction ? `<div class="notice-action">${notice.recommendedAction}</div>` : ''}
      ${notice.debugDetails ? `<details><summary>查看调试信息</summary><div>${notice.debugDetails}</div></details>` : ''}
    `;
  }

  renderPreview(items: PreviewItemViewState[], currentIndex: number, totalCount: number, stale: boolean, staleLabel: string): void {
    if (!this.preview) {
      return;
    }
    this.preview.innerHTML = '';
    this.preview.setAttribute('role', 'listbox');
    this.preview.dataset.currentIndex = String(currentIndex);
    this.preview.dataset.totalCount = String(totalCount);
    const previewMeta = this.root?.querySelector<HTMLSpanElement>('#preview-meta');
    if (previewMeta) {
      previewMeta.textContent = stale
        ? staleLabel
        : `${String(Math.min(currentIndex + 1, totalCount || 1)).padStart(2, '0')} / ${String(totalCount).padStart(2, '0')}`;
      previewMeta.classList.toggle('stale-tip', stale);
    }
    const prevButton = this.root?.querySelector<HTMLButtonElement>('#preview-prev');
    const nextButton = this.root?.querySelector<HTMLButtonElement>('#preview-next');
    if (prevButton) {
      prevButton.disabled = currentIndex <= 0;
    }
    if (nextButton) {
      nextButton.disabled = currentIndex >= totalCount - 1;
    }
    if (stale) {
      this.preview.dataset.stale = 'true';
    } else {
      delete this.preview.dataset.stale;
    }
    const visibleItem = items.find((item) => item.active) || items[0];
    if (visibleItem) {
      this.preview.append(renderPreviewButton(this.documentRef, visibleItem, currentIndex));
    }
  }
}
