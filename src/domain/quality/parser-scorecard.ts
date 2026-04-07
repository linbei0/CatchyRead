export type ParserScoreDimension =
  | 'contentExtraction'
  | 'codeHandling'
  | 'segmentation'
  | 'pageNavigation'
  | 'firstAudioLatency';

export interface ParserScoreEntry {
  pageId: string;
  url: string;
  metrics: Record<ParserScoreDimension, number>;
}

export interface ParserScoreResult {
  pageId: string;
  url: string;
  weightedScore: number;
  percentage: number;
}

export interface ParserScoreSummary {
  totalPages: number;
  averagePercentage: number;
  dimensionAverages: Record<ParserScoreDimension, number>;
  pagesNeedingAttention: string[];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(5, value));
}

export function calculateParserScore(entry: ParserScoreEntry): ParserScoreResult {
  const weightedScore = (Object.keys(entry.metrics) as ParserScoreDimension[]).reduce((total, dimension) => {
    return total + clampScore(entry.metrics[dimension]);
  }, 0);
  const maxScore = 25;

  return {
    pageId: entry.pageId,
    url: entry.url,
    weightedScore,
    percentage: Math.round((weightedScore / maxScore) * 100)
  };
}

export function summarizeParserScorecard(entries: ParserScoreEntry[]): ParserScoreSummary {
  const dimensionTotals: Record<ParserScoreDimension, number> = {
    contentExtraction: 0,
    codeHandling: 0,
    segmentation: 0,
    pageNavigation: 0,
    firstAudioLatency: 0
  };
  const results = entries.map(calculateParserScore);

  entries.forEach((entry) => {
    for (const dimension of Object.keys(dimensionTotals) as ParserScoreDimension[]) {
      dimensionTotals[dimension] += clampScore(entry.metrics[dimension]);
    }
  });

  const totalPages = entries.length;

  return {
    totalPages,
    averagePercentage: totalPages
      ? Math.round(results.reduce((total, result) => total + result.percentage, 0) / totalPages)
      : 0,
    dimensionAverages: {
      contentExtraction: totalPages ? dimensionTotals.contentExtraction / totalPages : 0,
      codeHandling: totalPages ? dimensionTotals.codeHandling / totalPages : 0,
      segmentation: totalPages ? dimensionTotals.segmentation / totalPages : 0,
      pageNavigation: totalPages ? dimensionTotals.pageNavigation / totalPages : 0,
      firstAudioLatency: totalPages ? dimensionTotals.firstAudioLatency / totalPages : 0
    },
    pagesNeedingAttention: results.filter((result) => result.percentage < 80).map((result) => result.pageId)
  };
}
