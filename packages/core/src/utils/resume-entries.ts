import { ResolvedNode } from '../types/flow';
import { ExecutionSnapshot } from '../types/snapshot';

interface BuildResumeEntriesOptions {
  resolved: ResolvedNode[];
  snapshot: ExecutionSnapshot;
  executedNodeOutputs: Map<string, any>;
}

function sameIter(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function buildResumeEntries({
  resolved,
  snapshot,
  executedNodeOutputs,
}: {
  resolved: ResolvedNode[];
  snapshot: ExecutionSnapshot;
  executedNodeOutputs: Map<string, any>;
}): { nodeId: string; iterationContext: number[] }[] {
  return resolved.map(({ nodeId, output, iterationContext }) => {
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

    const key = iter.length ? `${nodeId}_${iter.join('_')}` : nodeId;
    executedNodeOutputs.set(key, output);

    if (iter.length) {
      const existing = executedNodeOutputs.get(nodeId);
      const agg = Array.isArray(existing) ? [...existing] : [];
      const lastIdx = iter[iter.length - 1];
      agg[lastIdx] = output;
      executedNodeOutputs.set(nodeId, agg);
    }

    return { nodeId, iterationContext: iter };
  });
}
