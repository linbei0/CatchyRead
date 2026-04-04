import { buildSpokenSegments } from '@/lib/extract/blockProcessing';
import { extractPageSnapshot } from '@/lib/extract/pageSnapshot';
import type { CodeStrategy, PageSnapshot, SmartScriptSegment, StructuredBlock } from '@/shared/types';

export interface SnapshotResult {
  snapshot: PageSnapshot;
  originalSegments: SmartScriptSegment[];
}

export class SnapshotService {
  refresh(documentRef: Document, codeStrategy: CodeStrategy): SnapshotResult {
    const snapshot = extractPageSnapshot(documentRef);
    return {
      snapshot,
      originalSegments: this.buildOriginalSegments(snapshot, codeStrategy)
    };
  }

  buildOriginalSegments(snapshot: PageSnapshot, codeStrategy: CodeStrategy): SmartScriptSegment[] {
    return this.buildOriginalSegmentsFromBlocks(snapshot.structuredBlocks, codeStrategy);
  }

  buildOriginalSegmentsFromBlocks(blocks: StructuredBlock[], codeStrategy: CodeStrategy): SmartScriptSegment[] {
    return buildSpokenSegments(blocks, {
      mode: 'original',
      codeStrategy,
      maxSegmentChars: 220
    });
  }
}
