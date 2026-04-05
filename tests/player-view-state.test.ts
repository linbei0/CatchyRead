import { describe, expect, test } from 'vitest';

import { buildPlaybackViewState } from '@/content/playerViewState';
import type { SmartScriptSegment } from '@/lib/shared/types';

const segments: SmartScriptSegment[] = [
  {
    id: 'seg-1',
    sectionTitle: '环境准备',
    spokenText: '先确认 Node 版本，再安装依赖并启动开发环境。',
    sourceBlockIds: ['a'],
    kind: 'main'
  },
  {
    id: 'seg-2',
    sectionTitle: '风险提醒',
    spokenText: '这一段会提醒你不要把密钥提交到仓库，并建议先做本地测试。',
    sourceBlockIds: ['b'],
    kind: 'warning'
  }
];

describe('buildPlaybackViewState', () => {
  test('生成当前播放卡与队列摘要', () => {
    const state = buildPlaybackViewState({
      segments,
      currentIndex: 1,
      playbackStatus: 'playing',
      progressMode: 'segment-only'
    });

    expect(state.currentTitle).toBe('风险提醒');
    expect(state.positionLabel).toBe('02 / 02');
    expect(state.statusLabel).toBe('播放中');
    expect(state.previewItems).toHaveLength(2);
    expect(state.previewItems[1]).toMatchObject({
      title: '风险提醒',
      tone: 'warning',
      active: true
    });
    expect(state.previewItems[1].summary.length).toBeLessThanOrEqual(52);
  });

  test('仅在待机或暂停时显示页面定位入口', () => {
    expect(
      buildPlaybackViewState({
        segments,
        currentIndex: 0,
        playbackStatus: 'idle',
        progressMode: 'segment-only'
      }).showPagePicker
    ).toBe(true);

    expect(
      buildPlaybackViewState({
        segments,
        currentIndex: 0,
        playbackStatus: 'playing',
        progressMode: 'segment-only'
      }).showPagePicker
    ).toBe(false);
  });
});
