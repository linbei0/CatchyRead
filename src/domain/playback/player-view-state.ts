import type { PlaybackProgressMode, PlaybackStatus, SmartScriptSegment } from '@/shared/types';

export interface PreviewItemViewState {
  id: string;
  title: string;
  summary: string;
  tone: 'main' | 'warning' | 'code';
  active: boolean;
}

export interface PlaybackViewState {
  currentTitle: string;
  currentSummary: string;
  positionLabel: string;
  statusLabel: string;
  showPagePicker: boolean;
  previewItems: PreviewItemViewState[];
}

function trimSummary(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function mapSegmentTone(segment: SmartScriptSegment): PreviewItemViewState['tone'] {
  if (segment.kind === 'warning') {
    return 'warning';
  }
  if (segment.kind === 'code-summary') {
    return 'code';
  }
  return 'main';
}

function mapStatusLabel(status: PlaybackStatus, progressMode: PlaybackProgressMode): string {
  if (status === 'playing') {
    return progressMode === 'media-time' ? '远端播放中' : '播放中';
  }
  if (status === 'paused') {
    return '已暂停';
  }
  if (status === 'preparing') {
    return '准备中';
  }
  if (status === 'error') {
    return '需要处理';
  }
  return '待开始';
}

export function buildPlaybackViewState(args: {
  segments: SmartScriptSegment[];
  currentIndex: number;
  playbackStatus: PlaybackStatus;
  progressMode: PlaybackProgressMode;
}): PlaybackViewState {
  const currentSegment = args.segments[args.currentIndex];
  const total = args.segments.length;
  const currentNumber = total ? Math.min(args.currentIndex + 1, total) : 0;

  return {
    currentTitle: currentSegment?.sectionTitle || '还没有开始收听',
    currentSummary: currentSegment ? trimSummary(currentSegment.spokenText, 30) : '选好模式后开始收听。',
    positionLabel: `${String(currentNumber).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
    statusLabel: mapStatusLabel(args.playbackStatus, args.progressMode),
    showPagePicker: args.playbackStatus === 'idle' || args.playbackStatus === 'paused' || args.playbackStatus === 'error',
    previewItems: args.segments.map((segment, index) => ({
      id: segment.id,
      title: segment.sectionTitle,
      summary: trimSummary(segment.spokenText, 52),
      tone: mapSegmentTone(segment),
      active: index === args.currentIndex
    }))
  };
}
