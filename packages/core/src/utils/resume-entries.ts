import { ResolvedNode, ResumeEntry } from '../types/flow';
import { ExecutionSnapshot } from '../types/snapshot';

interface BuildResumeEntriesOptions {
  resolved: ResolvedNode[];
  snapshot: ExecutionSnapshot;
}

function sameIter(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function buildResumeEntries({
  resolved,
  snapshot,
}: BuildResumeEntriesOptions): ResumeEntry[] {
  return resolved.map(({ nodeId, iterationContext, resumeData }) => {
    let iter = Array.isArray(iterationContext) ? iterationContext : [];

    if (iter.length === 0) {
      const idx = snapshot.pending.findIndex((p) => p.nodeId === nodeId);

      if (idx >= 0) {
        iter = snapshot.pending[idx].iteration;
        snapshot.pending.splice(idx, 1);
      }
    } else {
      const idx = snapshot.pending.findIndex(
        (p) => p.nodeId === nodeId && sameIter(p.iteration, iter)
      );

      if (idx >= 0) snapshot.pending.splice(idx, 1);
    }

    return { nodeId, iterationContext: iter, resumeData };
  });
}
