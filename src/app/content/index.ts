import browser from 'webextension-polyfill';

import { RuntimeCacheRegistry } from '@/lib/cache/runtime-cache-registry';
import { buildSuccessNotice, mapErrorToNotice } from '@/lib/ui/feedback';
import {
  buildRewriteChunks,
  normalizeStructuredBlocksForRewrite,
  prepareStructuredBlocksForRewrite,
  shouldUseMultiChunkRewrite,
  type RewriteChunk
} from '@/domain/content/rewrite-pipeline';
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
  StructuredBlock,
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
  private smartRewriteResult: { requestId: string; snapshotRevision: number; segments: SmartScriptSegment[] } | null = null;
  private snapshotRevision = 0;
  private activeRewriteRequestId: string | null = null;
  private currentIndex = 0;
  private currentMode: ReadingMode = 'smart';
  private currentCodeStrategy: CodeStrategy = 'summary';
  private currentSpeechEngine: SpeechEngine = 'browser';
  private browserSpeechPaused = false;
  private open = false;
  private speaking = false;
  private pageSelectionMode = false;
  private pageSnapshotStale = false;
  private waitingForRewriteAppend = false;
  private persistUiTimer: ReturnType<typeof setTimeout> | null = null;
  private stopObservingSettings: (() => void) | null = null;
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
      this.smartRewriteResult = null;
    });
    this.bindViewEvents();
    this.selection.bindDocumentSelection({
      isOpen: () => this.open,
      isSelectionMode: () => this.pageSelectionMode,
      getSegments: () => this.previewSource(),
      onPick: (index) => {
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
      if (mode !== 'smart') {
        this.cancelActiveRewrite('Rewrite cancelled because user switched mode.');
      }
      this.currentMode = mode;
      this.playbackState.mode = mode;
      this.renderPreview();
    });
    this.view.on('codeStrategyChange', (codeStrategy: CodeStrategy) => {
      this.currentCodeStrategy = codeStrategy;
      this.cancelActiveRewrite('Rewrite cancelled because code strategy changed.');
      this.cacheRegistry.clearGroup('smart-segments');
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
    this.view.on('progressSeek', (ratio: number) => this.seekToProgress(ratio));
    this.view.on('previewSelect', (index: number) => {
      this.currentIndex = index;
      this.renderPreview();
      this.view.focusPreview();
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
    if (!this.stopObservingSettings) {
      this.stopObservingSettings = this.gateway.observeSettings((settings) => {
        this.applySettings(settings, { external: true });
      });
    }
    this.applyCapabilityConstraints();
    this.refreshPageContent(false);
    this.pageRefreshWatcher.start();
  }

  private hide(): void {
    this.stopAll();
    this.cancelActiveRewrite('Rewrite cancelled because player closed.');
    this.pageRefreshWatcher.stop();
    this.cacheRegistry.clearGroup('remote-audio');
    this.setPageSelectionMode(false);
    this.waitingForRewriteAppend = false;
    if (this.stopObservingSettings) {
      this.stopObservingSettings();
      this.stopObservingSettings = null;
    }
    this.view.hide();
    this.open = false;
    this.selection.clearHighlight();
  }

  private async loadSettings(): Promise<void> {
    this.applySettings(await this.gateway.loadSettings());
  }

  private applySettings(settings: AppSettings, options: { external?: boolean } = {}): void {
    const previousSettings = this.settings;
    const previousSpeechEngine = this.currentSpeechEngine;
    const previousCodeStrategy = this.currentCodeStrategy;
    this.settings = settings;

    const llmChanged =
      !!previousSettings && JSON.stringify(previousSettings.providers.llm) !== JSON.stringify(settings.providers.llm);
    const ttsChanged =
      !!previousSettings && JSON.stringify(previousSettings.providers.tts) !== JSON.stringify(settings.providers.tts);
    const rewritePolicyChanged =
      !!previousSettings &&
      (
        previousSettings.playback.outputLanguage !== settings.playback.outputLanguage ||
        previousSettings.playback.outputLocale !== settings.playback.outputLocale
      );
    const playbackChanged =
      !!previousSettings && JSON.stringify(previousSettings.playback) !== JSON.stringify(settings.playback);
    const rateChanged = !!previousSettings && previousSettings.playback.rate !== settings.playback.rate;

    if (!previousSettings || !options.external || (playbackChanged && !this.speaking)) {
      this.currentMode = settings.playback.mode;
      this.currentCodeStrategy = settings.playback.codeStrategy;
      this.currentSpeechEngine = settings.playback.speechEngine;
    }

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

    if (rateChanged && this.currentSpeechEngine === 'remote' && this.remoteAudio.hasSource) {
      this.remoteAudio.setRate(settings.playback.rate);
    } else if (rateChanged && this.browserSpeech.hasActiveUtterance) {
      this.browserSpeech.updateRate(settings.playback.rate);
    }

    if (ttsChanged) {
      this.cacheRegistry.clearGroup('remote-audio');
    }

    if (this.snapshot && previousCodeStrategy !== settings.playback.codeStrategy) {
      this.originalSegments = this.snapshotService.buildOriginalSegments(this.snapshot, settings.playback.codeStrategy);
      this.cacheRegistry.clearGroup('smart-segments');
    }

    if (llmChanged || rewritePolicyChanged) {
      this.cancelActiveRewrite('Rewrite cancelled because provider settings changed.');
      this.cacheRegistry.clearGroup('smart-segments');
    }

    if (options.external && this.open) {
      const activeEngineChanged = previousSpeechEngine !== this.currentSpeechEngine;
      if (ttsChanged || llmChanged || rewritePolicyChanged || activeEngineChanged) {
        this.setNotice({
          category: 'info',
          title: '设置已更新',
          message: this.speaking ? '新的配置会从下一段开始生效。' : '新的配置已经生效，可以直接继续播放。',
          recommendedAction: this.speaking ? '当前段落会播完，下一段会切到新配置。' : '现在直接点“开始收听”即可。'
        });
      }
    }

    this.renderPreview();
  }

  private refreshPageContent(showStatus = true): void {
    this.cancelActiveRewrite('Rewrite cancelled because page content refreshed.');
    this.cacheRegistry.clearGroup('smart-segments');
    const refreshed = this.snapshotService.refresh(document, this.currentCodeStrategy);
    this.snapshotRevision += 1;
    this.snapshot = refreshed.snapshot;
    this.originalSegments = refreshed.originalSegments;
    this.currentIndex = Math.min(this.currentIndex, Math.max(this.previewSource().length - 1, 0));
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
        recommendedAction: '首批内容整理好后会立即开始播放。'
      });
      try {
        if (!this.hasCurrentSmartRewrite()) {
          const requestId = this.createRewriteRequestId();
          const snapshotRevision = this.snapshotRevision;
          this.activeRewriteRequestId = requestId;
          const initialSegments = await this.prepareSmartRewriteInitialSegments(requestId, snapshotRevision);
          if (!initialSegments.length || !this.shouldCommitRewriteResult(requestId, snapshotRevision)) {
            return;
          }
          this.smartRewriteResult = {
            requestId,
            snapshotRevision,
            segments: initialSegments
          };
          void this.continueSmartRewriteInBackground(requestId, snapshotRevision);
        }
      } catch (error) {
        if (!this.isRewriteStillActive()) {
          return;
        }
        this.activeRewriteRequestId = null;
        this.fail(error);
        return;
      }
    } else {
      this.cancelActiveRewrite('Rewrite cancelled because original mode started.');
    }
    this.cacheRegistry.clearGroup('remote-audio');
    this.currentIndex = Math.min(startIndex, Math.max(this.playbackSource().length - 1, 0));
    this.renderPreview();
    await this.playCurrent();
  }

  private async playPause(): Promise<void> {
    const preparation = resolvePlaybackPreparation({
      mode: this.currentMode,
      currentSegments: this.playbackSource(),
      originalSegments: this.originalSegments,
      smartSegments: this.currentSmartSegments()
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
    const segments = this.playbackSource();
    const segment = segments[this.currentIndex];
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
    this.playbackState.totalSegments = segments.length;
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

  private seekToProgress(ratio: number): void {
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const segments = this.playbackSource();
    if (!segments.length) {
      return;
    }

    if (
      this.playbackState.progressMode === 'media-time' &&
      this.currentSpeechEngine === 'remote' &&
      this.playbackState.durationSeconds &&
      this.playbackState.durationSeconds > 0
    ) {
      this.remoteAudio.seekTo(this.playbackState.durationSeconds * clampedRatio);
      this.playbackState.currentTimeSeconds = this.playbackState.durationSeconds * clampedRatio;
      this.renderPlaybackChrome();
      return;
    }

    const targetIndex = Math.min(segments.length - 1, Math.max(0, Math.round((segments.length - 1) * clampedRatio)));
    if (targetIndex === this.currentIndex) {
      return;
    }
    this.currentIndex = targetIndex;
    this.renderPreview();
    if (this.speaking) {
      void this.playCurrent();
      return;
    }
    const item = segments[targetIndex];
    this.setNotice({
      category: 'info',
      title: '起点已经换好',
      message: item ? `下一次会从「${item.sectionTitle}」开始。` : '下一次会从新的位置开始。',
      recommendedAction: '现在点“开始收听”即可。'
    });
  }

  private buildRewritePayload(blocks: StructuredBlock[], requestId: string, snapshotRevision: number) {
    if (!this.snapshot || !this.settings) {
      throw new Error('页面快照或设置未准备好，无法开始智能整理。');
    }
    return {
      snapshot: this.snapshot,
      canonicalBlocks: blocks,
      requestId,
      snapshotRevision,
      policy: {
        preserveFacts: true,
        tone: 'podcast-lite',
        maxSegmentChars: 220,
        codeStrategy: this.currentCodeStrategy,
        outputLanguage: this.settings.playback.outputLanguage ?? 'follow-page',
        outputLocale: this.settings.playback.outputLocale ?? 'zh-CN',
        uiLanguage: navigator.language
      }
    } as const;
  }

  private buildSmartRewriteChunks(): RewriteChunk[] {
    if (!this.snapshot) {
      return [];
    }
    const filteredBlocks =
      this.currentCodeStrategy === 'skip'
        ? this.snapshot.structuredBlocks.filter((block) => block.type !== 'code')
        : this.snapshot.structuredBlocks;
    const preparedBlocks = prepareStructuredBlocksForRewrite(filteredBlocks);
    const normalizedBlocks = normalizeStructuredBlocksForRewrite(preparedBlocks);
    if (!normalizedBlocks.length) {
      return [];
    }
    return shouldUseMultiChunkRewrite(normalizedBlocks)
      ? buildRewriteChunks(normalizedBlocks, { softCharLimit: 1800, hardCharLimit: 2400 })
      : [
          {
            id: 'chunk-1',
            blocks: normalizedBlocks,
            charCount: normalizedBlocks.reduce((sum, block) => sum + block.text.length, 0)
          }
        ];
  }

  private buildFallbackSegmentsForChunk(chunk: RewriteChunk): SmartScriptSegment[] {
    return this.snapshotService.buildOriginalSegmentsFromBlocks(chunk.blocks, this.currentCodeStrategy);
  }

  private async requestRewriteChunk(chunk: RewriteChunk, requestId: string, snapshotRevision: number): Promise<SmartScriptSegment[]> {
    return this.gateway.rewrite(this.buildRewritePayload(chunk.blocks, requestId, snapshotRevision));
  }

  private async prepareSmartRewriteInitialSegments(requestId: string, snapshotRevision: number): Promise<SmartScriptSegment[]> {
    const chunks = this.buildSmartRewriteChunks();
    if (!chunks.length) {
      this.activeRewriteRequestId = null;
      return [];
    }

    try {
      return await this.requestRewriteChunk(chunks[0]!, requestId, snapshotRevision);
    } catch {
      this.setNotice({
        category: 'info',
        title: '首批内容已回退原文',
        message: '第一批智能整理失败，已自动切回原文段落保证可以继续播放。',
        recommendedAction: '后续段落会继续尝试智能整理。'
      });
      return this.buildFallbackSegmentsForChunk(chunks[0]!);
    }
  }

  private async continueSmartRewriteInBackground(requestId: string, snapshotRevision: number): Promise<void> {
    const chunks = this.buildSmartRewriteChunks();
    if (chunks.length <= 1) {
      this.activeRewriteRequestId = null;
      return;
    }

    for (let index = 1; index < chunks.length; index += 1) {
      if (!this.shouldCommitRewriteResult(requestId, snapshotRevision)) {
        return;
      }

      const chunk = chunks[index]!;
      let segments: SmartScriptSegment[];
      try {
        segments = await this.requestRewriteChunk(chunk, requestId, snapshotRevision);
      } catch {
        segments = this.buildFallbackSegmentsForChunk(chunk);
        this.setNotice({
          category: 'info',
          title: '部分段落已回退原文',
          message: `第 ${index + 1} 批智能整理失败，已自动回退为原文朗读，播放不会中断。`,
          recommendedAction: '你可以继续收听；如果想重试，稍后刷新页面即可。'
        });
      }

      if (!this.shouldCommitRewriteResult(requestId, snapshotRevision)) {
        return;
      }
      this.appendSmartRewriteSegments(segments, requestId, snapshotRevision);
    }

    if (!this.shouldCommitRewriteResult(requestId, snapshotRevision)) {
      return;
    }
    this.activeRewriteRequestId = null;
    if (this.waitingForRewriteAppend) {
      this.waitingForRewriteAppend = false;
      this.setNotice(buildSuccessNotice('已经听到最后', '这一页的段落已经播放到结尾。', '如果还想重听，直接点任意段落即可。'));
      this.setPlaybackStatus('idle');
    }
  }

  private appendSmartRewriteSegments(segments: SmartScriptSegment[], requestId: string, snapshotRevision: number): void {
    if (!segments.length) {
      return;
    }
    const previousLength = this.smartRewriteResult?.segments.length || 0;
    const nextSegments = [...(this.smartRewriteResult?.segments || []), ...segments];
    this.smartRewriteResult = {
      requestId,
      snapshotRevision,
      segments: nextSegments
    };
    this.renderPreview();
    if (this.waitingForRewriteAppend && previousLength < nextSegments.length) {
      this.waitingForRewriteAppend = false;
      this.currentIndex = previousLength;
      void this.playCurrent();
    }
  }

  private async advance(step: number): Promise<void> {
    const segments = this.playbackSource();
    if (!segments.length) {
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
    if (nextIndex >= segments.length) {
      if (step > 0 && this.currentMode === 'smart' && this.isRewriteStillActive()) {
        this.waitingForRewriteAppend = true;
        this.setNotice({
          category: 'info',
          title: '后续内容整理中',
          message: '前面的段落已经播完，正在继续整理下一批内容。',
          recommendedAction: '稍等片刻，整理完成后会自动续播。'
        });
        this.setPlaybackStatus('preparing');
        return;
      }
      this.stopAll();
      this.currentIndex = segments.length - 1;
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
    this.cancelActiveRewrite('Rewrite cancelled because current flow failed.');
    this.stopAll();
    this.cacheRegistry.clearGroup('remote-audio');
    this.setNotice(mapErrorToNotice(error, { surface: 'player', action: 'playback' }), 'error');
  }

  private previewSource(): SmartScriptSegment[] {
    if (this.currentMode === 'smart' && this.hasCurrentSmartRewrite()) {
      return this.smartRewriteResult?.segments || [];
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
    this.view.renderPreview(viewState.previewItems, this.currentIndex, segments.length, this.pageSnapshotStale, '内容已变更');
    this.renderPlaybackChrome();
  }

  private renderPlaybackChrome(): void {
    const segments = this.playbackSource();
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
      this.view.focusPreview();
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
    const dragbar = root.querySelector<HTMLElement>('.topbar');
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
      if ((event.target as HTMLElement)?.closest('button, select, option')) {
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
    const segment = this.playbackSource()[index];
    const provider = this.settings?.providers.tts;
    const providerKey = provider ? `${provider.providerId}::${provider.baseUrl}::${provider.modelOrVoice}` : 'missing-provider';
    const voice = provider?.voiceId || 'default';
    const rate = this.settings?.playback.rate || 1;
    return `${segment?.id || 'missing'}::${providerKey}::${voice}::${rate}`;
  }

  private async getRemoteAudioForIndex(index: number): Promise<RemoteAudioPayload> {
    const segment = this.playbackSource()[index];
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
    if (index < 0 || index >= this.playbackSource().length) {
      return;
    }
    try {
      await this.getRemoteAudioUrlForIndex(index);
    } catch {
      this.remoteAudioPayloadCache.delete(this.remoteCacheKey(index));
    }
  }

  private currentSmartSegments(): SmartScriptSegment[] {
    return this.hasCurrentSmartRewrite() ? this.smartRewriteResult?.segments || [] : [];
  }

  private playbackSource(): SmartScriptSegment[] {
    return this.previewSource();
  }

  private hasCurrentSmartRewrite(): boolean {
    return Boolean(this.smartRewriteResult && this.smartRewriteResult.snapshotRevision === this.snapshotRevision);
  }

  private createRewriteRequestId(): string {
    return `rewrite-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  private shouldCommitRewriteResult(requestId: string, snapshotRevision: number): boolean {
    return this.activeRewriteRequestId === requestId && this.snapshotRevision === snapshotRevision;
  }

  private isRewriteStillActive(): boolean {
    return Boolean(this.activeRewriteRequestId);
  }

  private cancelActiveRewrite(reason: string): void {
    const activeRewriteRequestId = this.activeRewriteRequestId;
    if (!activeRewriteRequestId) {
      return;
    }
    this.activeRewriteRequestId = null;
    void this.gateway.cancelRewrite(activeRewriteRequestId).catch(() => {
      // 这里不能再抛错，否则会把后续真正的用户操作打断。
    });
    this.setNotice(
      {
        category: 'rewrite-cancelled',
        title: '智能整理已取消',
        message: '上一轮整理结果不会再覆盖当前页面状态。',
        recommendedAction: '如需继续，请重新点击“智能整理”。',
        debugDetails: reason,
        canRetry: true
      },
      this.playbackState.status === 'error' ? 'error' : 'idle'
    );
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
