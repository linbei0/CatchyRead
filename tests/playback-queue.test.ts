import { describe, expect, test } from 'vitest';

import { resolvePlaybackPreparation } from '@/content/playbackQueue';
import type { SmartScriptSegment } from '@/lib/shared/types';

const originalSegments: SmartScriptSegment[] = [
  {
    id: 'original-1',
    sectionTitle: '章节一',
    spokenText: '这是原文第一段。',
    sourceBlockIds: ['block-1'],
    kind: 'main'
  }
];

const smartSegments: SmartScriptSegment[] = [
  {
    id: 'smart-1',
    sectionTitle: '章节一',
    spokenText: '这是整理后的第一段。',
    sourceBlockIds: ['block-1'],
    kind: 'main'
  }
];

describe('resolvePlaybackPreparation', () => {
  test('智能模式但尚未整理队列时，必须重新准备 smart 队列', () => {
    const result = resolvePlaybackPreparation({
      mode: 'smart',
      currentSegments: originalSegments,
      originalSegments,
      smartSegments: []
    });

    expect(result).toBe('prepare-smart');
  });

  test('智能模式且 smart 队列已准备好时，允许直接播放当前队列', () => {
    const result = resolvePlaybackPreparation({
      mode: 'smart',
      currentSegments: smartSegments,
      originalSegments,
      smartSegments
    });

    expect(result).toBe('play-current');
  });

  test('原文模式下若当前不是原文队列，也必须重建原文队列', () => {
    const result = resolvePlaybackPreparation({
      mode: 'original',
      currentSegments: smartSegments,
      originalSegments,
      smartSegments
    });

    expect(result).toBe('prepare-original');
  });
});
