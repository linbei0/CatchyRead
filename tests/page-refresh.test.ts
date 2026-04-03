import { describe, expect, test } from 'vitest';

import { shouldMarkSnapshotStale } from '@/content/page-refresh';

describe('shouldMarkSnapshotStale', () => {
  test('URL 变化时应标记内容过期', () => {
    expect(
      shouldMarkSnapshotStale({
        previousUrl: 'https://example.com/a',
        nextUrl: 'https://example.com/b',
        addedNodes: 0,
        removedNodes: 0
      })
    ).toBe(true);
  });

  test('大量 DOM 变化时应标记内容过期', () => {
    expect(
      shouldMarkSnapshotStale({
        previousUrl: 'https://example.com/a',
        nextUrl: 'https://example.com/a',
        addedNodes: 12,
        removedNodes: 3
      })
    ).toBe(true);
  });

  test('轻微变化不应触发过期', () => {
    expect(
      shouldMarkSnapshotStale({
        previousUrl: 'https://example.com/a',
        nextUrl: 'https://example.com/a',
        addedNodes: 1,
        removedNodes: 0
      })
    ).toBe(false);
  });
});
