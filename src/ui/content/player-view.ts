import type { CodeStrategy, ReadingMode, SpeechEngine, UserNotice } from '@/shared/types';
import type { PreviewItemViewState } from '@/domain/playback/player-view-state';
import { renderPreviewButton } from '@/ui/content/player-markup';
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

function createTemplate(documentRef: Document): HTMLDivElement {
  const root = documentRef.createElement('div');
  root.innerHTML = `
    <div class="panel">
      <div class="dragbar">
        <div class="brand">
          <span class="eyebrow">CatchyRead</span>
          <h2 class="title">正在收听</h2>
        </div>
        <div class="toolbar-actions">
          <span class="mode-pill" id="mode-pill">智能整理</span>
          <button id="collapse" type="button">折叠</button>
          <button id="close" type="button">关闭</button>
        </div>
      </div>
      <section class="hero">
        <div class="mode-switch" role="tablist" aria-label="朗读模式">
          <button class="active" data-mode="smart" type="button">智能整理</button>
          <button data-mode="original" type="button">原文直读</button>
        </div>
        <div class="status-card">
          <div class="status-meta">
            <span class="state-badge" id="state-badge">待开始</span>
            <span id="segment-position">00 / 00</span>
          </div>
          <h3 id="current-title">还没有开始收听</h3>
        </div>
        <div class="notice" id="status"></div>
        <div class="progress">
          <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
          <div class="progress-meta" id="progress-meta"><span>准备就绪</span><span>等待开始</span></div>
        </div>
      </section>
      <div class="transport">
        <button id="prev" type="button">上一段</button>
        <button id="play-pause" type="button">开始收听</button>
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
        <div class="more-panel">
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
  return root;
}

export function buildPlayerViewCss(): string {
  return `
    :host { all: initial; font-family: Inter, "Segoe UI", "PingFang SC", sans-serif; color: #f5f7fb; }
    *, *::before, *::after { box-sizing: border-box; }
    button, select { font: inherit; }
    .panel { width: min(392px, calc(100vw - 24px)); max-height: min(680px, calc(100vh - 20px)); overflow: auto; border-radius: 24px; padding: 14px; color: #f5f7fb; background: linear-gradient(180deg, rgba(21,26,37,.98), rgba(12,16,24,.98)); border: 1px solid rgba(255,255,255,.08); box-shadow: 0 20px 60px rgba(0,0,0,.38); }
    .dragbar, .toolbar-actions, .mode-switch, .transport, .secondary-controls, .preview-head, .more-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .dragbar { justify-content: space-between; align-items: start; margin-bottom: 10px; cursor: move; }
    .brand { display: grid; gap: 4px; }
    .eyebrow { color: #f5b56f; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; }
    .title, h3 { margin: 0; }
    button { cursor: pointer; min-height: 40px; border: 1px solid rgba(255,255,255,.12); border-radius: 999px; padding: 8px 14px; color: #f5f7fb; background: rgba(255,255,255,.05); }
    .hero, .more-panel, .notice { display: grid; gap: 8px; border-radius: 18px; }
    .hero { padding: 12px; margin-bottom: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06); }
    .mode-pill, .state-badge { display: inline-flex; align-items: center; padding: 5px 10px; border-radius: 999px; font-size: 12px; background: rgba(245,181,111,.12); color: #ffd59f; }
    .mode-switch { padding: 4px; border-radius: 999px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); width: fit-content; }
    .mode-switch button { border: 0; background: transparent; color: #b8c0d4; }
    .mode-switch button.active { color: #1d1307; background: linear-gradient(135deg, #f5b56f, #ffd59f); font-weight: 700; }
    .status-meta, .progress-meta, .preview-head { justify-content: space-between; align-items: center; color: #acb3c5; font-size: 12px; }
    .notice { padding: 10px 12px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); }
    .notice[data-tone="danger"] { border-color: rgba(255,139,123,.28); background: rgba(255,139,123,.08); }
    .notice[data-tone="success"] { border-color: rgba(134,211,158,.28); background: rgba(134,211,158,.08); }
    .notice-title { font-size: 12px; font-weight: 700; }
    .notice-body, .notice-action { color: #c3cad9; font-size: 11px; line-height: 1.4; }
    .notice.compact .notice-body, .notice.compact .notice-action { display: none; }
    .progress-track { height: 8px; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,.08); }
    .progress-fill { height: 100%; width: 0%; border-radius: inherit; background: linear-gradient(90deg, #f5b56f, #ffd59f); }
    .transport button { flex: 1; }
    #play-pause { border: 0; color: #24160a; font-weight: 700; background: linear-gradient(135deg, #f5b56f, #ffd59f); }
    .control-chip { display: grid; gap: 6px; flex: 1; color: #c3cad9; font-size: 12px; }
    select { width: 100%; border-radius: 14px; border: 1px solid rgba(255,255,255,.12); padding: 9px 12px; color: #f5f7fb; background: rgba(255,255,255,.05); color-scheme: dark; }
    option { color: #111827; background: #f8fafc; }
    .more-panel { display: none; padding: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
    .more.open .more-panel { display: grid; }
    .preview { display: grid; gap: 8px; max-height: 180px; overflow: auto; }
    .preview button { text-align: left; display: grid; gap: 4px; border-radius: 18px; border-left: 3px solid transparent; }
    .preview button[data-tone="main"] { border-left-color: rgba(245,181,111,.5); }
    .preview button[data-tone="warning"] { border-left-color: rgba(240,198,106,.8); }
    .preview button[data-tone="code"] { border-left-color: rgba(126,179,255,.8); }
    .preview button.active { transform: translateX(2px); border-color: rgba(245,181,111,.22); background: rgba(255,255,255,.08); }
    .preview small, .preview strong, .preview span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .preview small { color: #97a0b4; font-size: 11px; text-transform: uppercase; }
    .preview span { color: #c3cad9; font-size: 11px; }
    .stale-tip { color: #f0c66a; }
    .collapsed .hero, .collapsed .secondary-controls, .collapsed .more, .collapsed .preview-head, .collapsed .preview { display: none; }
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
    findElement<HTMLButtonElement>(this.root, '#close').addEventListener('click', () => this.handlers.close?.());
    findElement<HTMLButtonElement>(this.root, '#collapse').addEventListener('click', () => this.handlers.collapse?.());
    findElement<HTMLButtonElement>(this.root, '#more-toggle').addEventListener('click', () => this.handlers.more?.());
    findElement<HTMLButtonElement>(this.root, '#refresh-page').addEventListener('click', () => this.handlers.refresh?.());
    findElement<HTMLButtonElement>(this.root, '#pick-from-page').addEventListener('click', () => this.handlers.pageSelection?.());
    findElement<HTMLButtonElement>(this.root, '#play-pause').addEventListener('click', () => this.handlers.playPause?.());
    findElement<HTMLButtonElement>(this.root, '#prev').addEventListener('click', () => this.handlers.previous?.());
    findElement<HTMLButtonElement>(this.root, '#next').addEventListener('click', () => this.handlers.next?.());
    findElement<HTMLButtonElement>(this.root, '#settings').addEventListener('click', () => this.handlers.openSettings?.());
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
      if (value === 'summary' || value === 'full') {
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

  focusPreview(index: number): void {
    this.getPreviewButtons()[index]?.focus();
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
      button.textContent = model.collapseButtonLabel;
      button.setAttribute('aria-expanded', String(model.showQueue));
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
    if (currentTitle) {
      currentTitle.textContent = title;
    }
    if (position) {
      position.textContent = positionLabel;
    }
    if (badge) {
      badge.textContent = statusLabel;
      badge.dataset.tone = tone;
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
      button.textContent = label;
      button.disabled = disabled;
    }
  }

  setPageSelectionButton(enabled: boolean, hidden: boolean): void {
    const button = this.root?.querySelector<HTMLButtonElement>('#pick-from-page');
    if (!button) {
      return;
    }
    button.hidden = hidden;
    button.textContent = enabled ? '退出定位' : '页面定位';
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

  renderPreview(items: PreviewItemViewState[], currentIndex: number, stale: boolean, staleLabel: string): void {
    if (!this.preview) {
      return;
    }
    this.preview.innerHTML = '';
    this.preview.setAttribute('role', 'listbox');
    const previewMeta = this.root?.querySelector<HTMLSpanElement>('#preview-meta');
    if (previewMeta) {
      previewMeta.textContent = stale ? staleLabel : `共 ${items.length} 段`;
      previewMeta.classList.toggle('stale-tip', stale);
    }
    if (stale) {
      this.preview.dataset.stale = 'true';
    } else {
      delete this.preview.dataset.stale;
    }
    items.forEach((item, index) => {
      this.preview?.append(renderPreviewButton(this.documentRef, item, currentIndex, index));
    });
  }
}
