export type StructuredBlockType = 'paragraph' | 'heading' | 'list' | 'quote' | 'code' | 'note';
export type SmartSegmentKind = 'main' | 'code-summary' | 'warning';
export type ReadingMode = 'original' | 'smart';
export type CodeStrategy = 'summary' | 'full';
export type SpeechEngine = 'browser' | 'remote';

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

export interface PlaybackState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  currentSegmentId: string | null;
  rate: number;
  voiceId: string;
  mode: ReadingMode;
  speechEngine: SpeechEngine;
}
