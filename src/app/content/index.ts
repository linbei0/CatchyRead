import browser from 'webextension-polyfill';

import { RuntimeCacheRegistry } from '@/lib/cache/runtime-cache-registry';
import { buildSuccessNotice, mapErrorToNotice } from '@/lib/ui/feedback';
import { detectPlaybackCapabilities } from '@/domain/playback/capabilities';
import { buildPlaybackViewState } from '@/domain/playback/player-view-state';
import { resolvePlaybackPreparation } from '@/domain/playback/playback-preparation';
import { resolveBrowserSpeechAction } from '@/domain/playback/browser-speech-action';
import { resolvePreviewKeyboardAction } from '@/domain/playback/preview-keyboard';
import { PageRefreshWatcher } from '@/infra/content/page-refresh-watcher';
import { SnapshotService } from '@/infra/content/snapshot-service';
import { BrowserSpeechSession } from '@/infra/playback/browser-speech-session';
import { RemoteAudioUrlCache } from '@/infra/playback/remote-audio-url-cache';
import { RemoteAudioSession } from '@/infra/playback/remote-audio-session';
import { BrowserContentMessageGateway } from '@/infra/runtime/content-message-gateway';
import { isProviderConfigured, type RuntimeMessage } from '@/shared/messages';
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
} from '@/shared/types';
import { PlayerView } from '@/ui/content/player-view';
import { SelectionController } from '@/ui/content/selection-controller';

class ContentApp {
  private readonly view = new PlayerView(document);
  private readonly selection = new SelectionController(document);
  private readonly gateway = new BrowserContentMessageGateway((message) => browser.runtime.sendMessage(message as RuntimeMessage));
  private readonly snapshotService = new SnapshotService();
  private readonly cacheRegistry = new RuntimeCacheRegistry();
  private readonly capabilities = detectPlaybackCapabilities();
  private readonly pageRefreshWatcher = new PageRefreshWatcher(() => this.markPageStale());
  private readonly browserSpeech = new BrowserSpeechSession({
    onEnd: () => {
      this.speaking = false;
      this.setPlaybackStatus('idle');
      void this.advance(1);
    },
    onPause: () => {
      this.browserSpeechPaused = true;
    },
    onResume: () => {
      this.browserSpeechPaused = false;
    },
    onError: (error) => this.fail(error)
  });
  private readonly remoteAudio = new RemoteAudioSession({
    onEnded: () => {
      this.speaking = false;
      this.setPlaybackStatus('idle');
      void this.advance(1);
    },
    onPlay: () => {
      this.speaking = true;
      this.setPlaybackStatus('playing');
    },
    onPause: () => {
      this.speaking = false;
      if (this.remoteAudio.hasSource) {
        this.setPlaybackStatus('paused');
      }
    },
    onMetadata: (durationSeconds) => {
      this.playbackState.durationSeconds = durationSeconds;
      this.renderPlaybackChrome();
    },
    onTimeUpdate: (currentTimeSeconds, durationSeconds) => {
      this.playbackState.currentTimeSeconds = currentTimeSeconds;
      this.playbackState.durationSeconds = durationSeconds;
      this.renderPlaybackChrome();
    },
    onError: (error) => this.fail(error)
  });

  private settings: AppSettings | null = null;
  private snapshot: PageSnapshot | null = null;
  private originalSegments: SmartScriptSegment[] = [];
  private smartSegments: SmartScriptSegment[] = [];
  private currentSegments: SmartScriptSegment[] = [];
  private currentIndex = 0;
  private currentMode: ReadingMode = 'smart';
  private currentCodeStrategy: CodeStrategy = 'summary';
  private currentSpeechEngine: SpeechEngine = 'browser';
  private browserSpeechPaused = false;
  private open = false;
  private speaking = false;
  private pageSelectionMode = false;
  private pageSnapshotStale = false;
  private persistUiTimer: ReturnType<typeof setTimeout> | null = null;
  private remoteAudioPayloadCache = new Map<string, Promise<RemoteAudioPayload>>();
  private remoteAudioUrlCache = new RemoteAudioUrlCache(3);
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

  constructor() {
    this.cacheRegistry.register('remote-audio', () => this.clearRemoteAudioCaches());
    this.cacheRegistry.register('smart-segments', () => {
      this.smartSegments = [];
    });
    this.bindViewEvents();
    this.selection.bindDocumentSelection({
      isOpen: () => this.open,
      isSelectionMode: () => this.pageSelectionMode,
      getSegments: () => this.previewSource(),
      onPick: (index) => {
        this.currentSegments = this.previewSource();
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
    });
    browser.runtime.onMessage.addListener((message: unknown) => {
      const typedMessage = message as RuntimeMessage;
      if (typedMessage.type === 'catchyread/toggle-player') {
        void this.toggle();
      }
    });
  }

  private bindViewEvents(): void {
    this.view.on('close', () => this.hide());
    this.view.on('collapse', () => this.toggleCollapsed());
    this.view.on('more', () => this.view.toggleMorePanel());
    this.view.on('refresh', () => this.refreshPageContent());
    this.view.on('pageSelection', () => this.togglePageSelectionMode());
    this.view.on('playPause', () => void this.playPause());
    this.view.on('previous', () => void this.advance(-1));
    this.view.on('next', () => void this.advance(1));
    this.view.on('openSettings', () => void this.gateway.openOptions());
    this.view.on('modeChange', (mode: ReadingMode) => {
      this.currentMode = mode;
      this.playbackState.mode = mode;
      this.renderPreview();
    });
    this.view.on('codeStrategyChange', (codeStrategy: CodeStrategy) => {
      this.currentCodeStrategy = codeStrategy;
      if (this.snapshot) {
        this.originalSegments = this.snapshotService.buildOriginalSegments(this.snapshot, codeStrategy);
      }
      this.renderPreview();
    });
    this.view.on('speechEngineChange', (speechEngine: SpeechEngine) => {
      this.currentSpeechEngine = speechEngine;
      this.playbackState.speechEngine = speechEngine;
      this.renderPlaybackChrome();
    });
    this.view.on('rateChange', (rate: number) => {
      if (!this.settings) {
        return;
      }
      this.settings.playback.rate = rate;
      this.playbackState.rate = rate;
      if (this.currentSpeechEngine === 'remote' && this.remoteAudio.hasSource) {
        this.remoteAudio.setRate(rate);
      } else if (this.currentSpeechEngine === 'browser' && this.browserSpeech.hasActiveUtterance) {
        this.browserSpeech.updateRate(rate);
      }
      this.renderPlaybackChrome();
    });
    this.view.on('previewSelect', (index: number) => {
      this.currentSegments = this.previewSource();
      this.currentIndex = index;
      this.renderPreview();
      this.view.focusPreview(index);
      if (this.speaking) {
        void this.playCurrent();
      } else {
        const item = this.previewSource()[index];
        this.setNotice({
          category: 'info',
          title: '起点已经换好',
          message: item ? `下一次播放会从「${item.sectionTitle}」开始。` : '下一次播放会从新起点开始。',
          recommendedAction: '现在点“开始收听”即可。'
        });
      }
    });
    this.view.on('keydown', (event: KeyboardEvent) => this.onRootKeyDown(event));
  }

  async toggle(): Promise<void> {
    if (this.open) {
      this.hide();
      return;
    }
    await this.show();
  }

  private async show(): Promise<void> {
    this.view.show();
    this.open = true;
    this.enableDrag();
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
    this.view.hide();
    this.open = false;
    this.selection.clearHighlight();
  }

  private async loadSettings(): Promise<void> {
    const settings = await this.gateway.loadSettings();
    this.settings = settings;
    this.currentMode = settings.playback.mode;
    this.currentCodeStrategy = settings.playback.codeStrategy;
    this.currentSpeechEngine = settings.playback.speechEngine;
    this.playbackState = {
      ...this.playbackState,
      rate: settings.playback.rate,
      voiceId: settings.providers.tts.voiceId || 'default',
      mode: this.currentMode,
      speechEngine: this.currentSpeechEngine
    };
    this.view.setMode(this.currentMode);
    this.view.setControls({
      codeStrategy: this.currentCodeStrategy,
      speechEngine: this.currentSpeechEngine,
      rate: settings.playback.rate,
      browserTtsAvailable: this.capabilities.browserTtsAvailable
    });
    this.view.setCollapsed(settings.ui.collapsed);
    this.view.setPosition(settings.ui.x, settings.ui.y);
    this.renderPlaybackChrome();
  }

  private refreshPageContent(showStatus = true): void {
    this.cacheRegistry.clearGroup('smart-segments');
    const refreshed = this.snapshotService.refresh(document, this.currentCodeStrategy);
    this.snapshot = refreshed.snapshot;
    this.originalSegments = refreshed.originalSegments;
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
    if (!this.capabilities.browserTtsAvailable && this.currentSpeechEngine === 'browser') {
      this.currentSpeechEngine = 'remote';
      this.playbackState.speechEngine = 'remote';
    }
    this.view.setControls({
      codeStrategy: this.currentCodeStrategy,
      speechEngine: this.currentSpeechEngine,
      rate: this.settings?.playback.rate || 1,
      browserTtsAvailable: this.capabilities.browserTtsAvailable
    });
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
        this.smartSegments = await this.gateway.rewrite(this.snapshot.structuredBlocks, {
          preserveFacts: true,
          tone: 'podcast-lite',
          maxSegmentChars: 220,
          codeStrategy: this.currentCodeStrategy
        });
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
      if (this.remoteAudio.hasSource && !this.remoteAudio.paused) {
        this.remoteAudio.pause();
        this.speaking = false;
        this.setPlaybackStatus('paused');
        return;
      }
      if (this.remoteAudio.hasSource && this.remoteAudio.paused) {
        await this.remoteAudio.resume();
        this.speaking = true;
        this.setPlaybackStatus('playing');
        return;
      }
    } else {
      const browserSpeechAction = resolveBrowserSpeechAction({
        hasActiveUtterance: this.browserSpeech.hasActiveUtterance,
        isPaused: this.browserSpeech.isPaused
      });
      if (browserSpeechAction === 'resume') {
        this.browserSpeech.resume();
        this.browserSpeechPaused = false;
        this.speaking = true;
        this.setPlaybackStatus('playing');
        return;
      }
      if (browserSpeechAction === 'pause') {
        this.browserSpeech.pause();
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
    this.selection.highlight(segment);
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
        await this.remoteAudio.play(objectUrl, this.settings.playback.rate);
        this.speaking = true;
        void this.prefetchRemoteAudio(this.currentIndex + 1);
        return;
      } catch (error) {
        this.fail(error);
        return;
      }
    }

    this.playbackState.progressMode = 'segment-only';
    this.browserSpeech.speak(segment.spokenText, {
      lang: this.snapshot?.language || 'zh-CN',
      rate: this.settings.playback.rate
    });
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
      this.setNotice(buildSuccessNotice('已经听到最后', '这一页的段落已经播放到结尾。', '如果还想重听，直接点任意段落即可。'));
      return;
    }
    this.currentIndex = nextIndex;
    this.renderPreview();
    await this.playCurrent();
  }

  private stopAll(): void {
    this.remoteAudio.stop();
    this.browserSpeech.stop();
    this.speaking = false;
    this.playbackState.currentTimeSeconds = undefined;
    this.playbackState.durationSeconds = undefined;
    this.renderPlaybackChrome();
  }

  private fail(error: unknown): void {
    this.stopAll();
    this.cacheRegistry.clearGroup('remote-audio');
    this.setNotice(mapErrorToNotice(error, { surface: 'player', action: 'playback' }), 'error');
  }

  private previewSource(): SmartScriptSegment[] {
    if (this.currentMode === 'smart' && this.smartSegments.length) {
      return this.smartSegments;
    }
    return this.originalSegments;
  }

  private renderPreview(): void {
    const segments = this.previewSource();
    const viewState = buildPlaybackViewState({
      segments,
      currentIndex: this.currentIndex,
      playbackStatus: this.playbackState.status,
      progressMode: this.playbackState.progressMode
    });
    this.view.setMode(this.currentMode);
    this.view.renderPreview(viewState.previewItems, this.currentIndex, this.pageSnapshotStale, '内容已变更，建议刷新');
    this.renderPlaybackChrome();
  }

  private renderPlaybackChrome(): void {
    const segments = this.currentSegments.length ? this.currentSegments : this.previewSource();
    const viewState = buildPlaybackViewState({
      segments,
      currentIndex: Math.min(this.currentIndex, Math.max(segments.length - 1, 0)),
      playbackStatus: this.playbackState.status,
      progressMode: this.playbackState.progressMode
    });
    const tone =
      this.playbackState.status === 'error'
        ? 'danger'
        : this.playbackState.status === 'playing'
          ? 'success'
          : this.playbackState.status === 'preparing'
            ? 'warning'
            : 'default';
    this.view.setMode(this.currentMode);
    this.view.setHeadline(viewState.currentTitle, viewState.positionLabel, viewState.statusLabel, tone);
    const totalSegments = segments.length;
    const currentNumber = totalSegments ? Math.min(this.currentIndex + 1, totalSegments) : 0;
    const segmentRatio = totalSegments ? currentNumber / totalSegments : 0;
    const mediaRatio =
      this.playbackState.progressMode === 'media-time' &&
      this.playbackState.durationSeconds &&
      this.playbackState.durationSeconds > 0
        ? (this.playbackState.currentTimeSeconds || 0) / this.playbackState.durationSeconds
        : undefined;
    const leftText = totalSegments ? `第 ${currentNumber} 段 / 共 ${totalSegments} 段` : '等待内容准备';
    const rightText =
      this.playbackState.progressMode === 'media-time'
        ? `${this.formatSeconds(this.playbackState.currentTimeSeconds)} / ${this.formatSeconds(this.playbackState.durationSeconds)}`
        : this.currentSpeechEngine === 'remote'
          ? '远端 TTS'
          : '浏览器语音';
    this.view.setProgress(mediaRatio ?? segmentRatio, leftText, rightText);
    const playLabel =
      this.playbackState.status === 'preparing'
        ? '准备中…'
        : this.playbackState.status === 'playing'
          ? '暂停'
          : this.playbackState.status === 'paused'
            ? '继续播放'
            : totalSegments
              ? '从这里开始'
              : '开始收听';
    this.view.setPlayPause(playLabel, this.playbackState.status === 'preparing');
    this.view.setPageSelectionButton(this.pageSelectionMode, !viewState.showPagePicker);
    this.view.renderNotice(
      this.playbackState.notice ||
        ({
          category: 'info',
          title: '准备就绪',
          message: '',
          recommendedAction: ''
        } satisfies UserNotice)
    );
  }

  private setNotice(notice: UserNotice, status?: PlaybackStatus): void {
    this.playbackState.notice = notice;
    if (status) {
      this.playbackState.status = status;
    }
    this.renderPlaybackChrome();
  }

  private setPlaybackStatus(status: PlaybackStatus): void {
    this.playbackState.status = status;
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

  private toggleCollapsed(): void {
    const root = this.view.getRoot();
    const nextCollapsed = !root?.classList.contains('collapsed');
    this.view.setCollapsed(Boolean(nextCollapsed));
    this.persistUiState({ collapsed: Boolean(nextCollapsed) });
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
    this.view.setPageSelectionButton(enabled, false);
    if (enabled) {
      this.view.closeMorePanel();
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
      }
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.closest('.preview')) {
      return;
    }
    const previewButtons = this.view.getPreviewButtons();
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
      this.view.focusPreview(action.nextIndex);
      return;
    }
    if (action.activate) {
      target.click();
    }
  }

  private enableDrag(): void {
    const root = this.view.getRoot();
    const host = this.view.getHost();
    if (!this.capabilities.pointerEventsSupported || !root || !host) {
      return;
    }
    const dragbar = root.querySelector<HTMLElement>('.dragbar');
    if (!dragbar || dragbar.dataset.dragBound === 'true') {
      return;
    }
    dragbar.dataset.dragBound = 'true';
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
      const rect = host.getBoundingClientRect();
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
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    });
    const stop = () => {
      dragging = false;
      const rect = host.getBoundingClientRect();
      this.persistUiState({
        x: Math.round(rect.left),
        y: Math.round(rect.top)
      });
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
        this.gateway.synthesizeRemote(segment.spokenText, this.settings.playback.rate, this.settings.providers.tts.voiceId)
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
    return this.remoteAudioUrlCache.set(key, new Blob([bytes.buffer], { type: audio.mimeType || 'audio/mpeg' }));
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

  private persistUiState(partial: Partial<AppSettings['ui']>): void {
    if (this.persistUiTimer) {
      clearTimeout(this.persistUiTimer);
    }
    this.persistUiTimer = setTimeout(() => {
      void this.gateway.saveUiState(partial);
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
  new ContentApp();
}
