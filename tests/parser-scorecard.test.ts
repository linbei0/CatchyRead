import { describe, expect, test } from 'vitest';

import { calculateParserScore, summarizeParserScorecard } from '@/domain/quality/parser-scorecard';

describe('parser-scorecard', () => {
  test('计算单页加权得分与百分比', () => {
    const result = calculateParserScore({
      pageId: 'mdn-fetch',
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API',
      metrics: {
        contentExtraction: 5,
        codeHandling: 4,
        segmentation: 4,
        pageNavigation: 5,
        firstAudioLatency: 3
      }
    });

    expect(result.weightedScore).toBe(21);
    expect(result.percentage).toBe(84);
  });

  test('汇总结果时输出均值与待修复页面列表', () => {
    const summary = summarizeParserScorecard([
      {
        pageId: 'react-useeffect',
        url: 'https://react.dev/reference/react/useEffect',
        metrics: {
          contentExtraction: 5,
          codeHandling: 5,
          segmentation: 4,
          pageNavigation: 4,
          firstAudioLatency: 4
        }
      },
      {
        pageId: 'python-dataclass',
        url: 'https://docs.python.org/3/library/dataclasses.html',
        metrics: {
          contentExtraction: 4,
          codeHandling: 2,
          segmentation: 3,
          pageNavigation: 4,
          firstAudioLatency: 3
        }
      }
    ]);

    expect(summary.totalPages).toBe(2);
    expect(summary.averagePercentage).toBe(76);
    expect(summary.dimensionAverages.codeHandling).toBe(3.5);
    expect(summary.pagesNeedingAttention).toEqual(['python-dataclass']);
  });
});
