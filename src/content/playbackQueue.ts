import type { ReadingMode, SmartScriptSegment } from '@/lib/shared/types';

export function resolvePlaybackPreparation(input: {
  mode: ReadingMode;
  currentSegments: SmartScriptSegment[];
  originalSegments: SmartScriptSegment[];
  smartSegments: SmartScriptSegment[];
}): 'prepare-smart' | 'prepare-original' | 'play-current' {
  if (input.mode === 'smart') {
    if (input.smartSegments.length === 0 || input.currentSegments !== input.smartSegments) {
      return 'prepare-smart';
    }
    return 'play-current';
  }

  if (input.currentSegments !== input.originalSegments) {
    return 'prepare-original';
  }

  return 'play-current';
}
