export type StructuredBlockType = 'paragraph' | 'heading' | 'list' | 'quote' | 'code' | 'note';
export type SmartSegmentKind = 'main' | 'code-summary' | 'warning';
export type ReadingMode = 'original' | 'smart';
export type CodeStrategy = 'summary' | 'full';
export type SpeechEngine = 'browser' | 'remote';
export type PlaybackStatus = 'idle' | 'preparing' | 'playing' | 'paused' | 'error';
export type PlaybackProgressMode = 'segment-only' | 'media-time';
export type UserNoticeCategory =
  | 'info'
  | 'success'
  | 'incomplete-config'
  | 'permission-denied'
  | 'network'
  | 'provider-rejected'
  | 'invalid-response'
  | 'audio-playback'
  | 'browser-unsupported'
  | 'unknown';

export interface StructuredBlock {
  id: string;
  type: StructuredBlockType;
  text: string;
  sourceElementId: string;
  level?: number;
  metadata?: {
    language?: string;
    label?: string;
  };
}

export interface PageSnapshot {
  url: string;
  title: string;
  language: string;
  capturedAt: string;
  excerpt?: string;
  structuredBlocks: StructuredBlock[];
}

export interface SmartScriptSegment {
  id: string;
  sectionTitle: string;
  spokenText: string;
  sourceBlockIds: string[];
  kind: SmartSegmentKind;
}

export interface ProviderConfig {
  providerId: string;
  kind: 'llm' | 'tts';
  enabled: boolean;
  baseUrl: string;
  modelOrVoice: string;
  apiKeyStoredLocally: string;
  headers?: Record<string, string>;
  temperature?: number;
  voiceId?: string;
  allowInsecureTransport?: boolean;
  allowPrivateNetwork?: boolean;
}

export interface RewritePolicy {
  preserveFacts: boolean;
  tone: string;
  maxSegmentChars?: number;
}

export interface SegmentBuildOptions {
  mode: ReadingMode;
  codeStrategy: CodeStrategy;
  maxSegmentChars?: number;
}

export interface PlaybackPreferences {
  rate: number;
  mode: ReadingMode;
  codeStrategy: CodeStrategy;
  speechEngine: SpeechEngine;
}

export interface UiPreferences {
  collapsed: boolean;
  x: number | null;
  y: number | null;
}

export interface AppSettings {
  providers: {
    llm: ProviderConfig;
    tts: ProviderConfig;
  };
  playback: PlaybackPreferences;
  ui: UiPreferences;
}

export interface RemoteAudioPayload {
  mimeType?: string;
  base64Audio?: string;
  mediaUrl?: string;
}

export interface UserNotice {
  category: UserNoticeCategory;
  title: string;
  message: string;
  recommendedAction: string;
  debugDetails?: string;
  canRetry?: boolean;
}

export interface PlaybackState {
  status: PlaybackStatus;
  currentSegmentId: string | null;
  currentIndex: number;
  totalSegments: number;
  rate: number;
  voiceId: string;
  mode: ReadingMode;
  speechEngine: SpeechEngine;
  progressMode: PlaybackProgressMode;
  currentTimeSeconds?: number;
  durationSeconds?: number;
  notice: UserNotice | null;
}

export interface ProviderTestResult {
  ok: boolean;
  providerKind: 'llm' | 'tts';
  category: UserNoticeCategory;
  title: string;
  message: string;
  recommendedAction: string;
  debugDetails?: string;
  canRetry?: boolean;
}
