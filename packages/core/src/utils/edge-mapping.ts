import { ExecutedNodeOutputs } from '../types/core';
import { BranchEdge, Edge } from '../types/edge';
import { Node } from '../types/node';
import { isObjectEmpty } from '../utils/object';

export function isBranchEdge(edge: Edge): edge is BranchEdge {
  const branchEdge = edge as BranchEdge;
  return branchEdge?.branch !== null && branchEdge?.branch !== undefined;
}

interface GetOutputForEdgeOptions {
  aggregatedOutput: any;
  sourceValue: string | undefined;
  iteration?: number;
}

function getOutputForEdge({ aggregatedOutput, sourceValue, iteration }: GetOutputForEdgeOptions) {
  if (Array.isArray(aggregatedOutput)) {
    const index =
      iteration !== undefined && iteration < aggregatedOutput.length
        ? iteration
        : aggregatedOutput.length - 1;
    return aggregatedOutput[index]?.[sourceValue || ''] ?? null;
  }

  return aggregatedOutput?.[sourceValue || ''];
}

interface MapNodeOutputsToInputOptions {
  node: Node;
  inputEdgesMap?: Map<string, Edge[]>;
  executedNodeOutputs: ExecutedNodeOutputs;
  iteration?: number;
}

export function mapNodeOutputsToInput({
  node,
  inputEdgesMap,
  executedNodeOutputs,
  iteration,
}: MapNodeOutputsToInputOptions) {
  const inputEdges = inputEdgesMap!.get(node.id) ?? [];
  const input = {} as typeof node.input;

  for (const edge of inputEdges) {
    const agg = executedNodeOutputs.get(edge.source);
    const effectiveIteration = Array.isArray(agg) ? (iteration ?? agg.length - 1) : undefined;

    const value = getOutputForEdge({
      aggregatedOutput: agg,
      sourceValue: edge?.sourceValue,
      iteration: effectiveIteration,
    });

    if (value === undefined)
      throw new Error(`No output for ${edge.source} (iter=${iteration}) key="${edge.sourceValue}"`);

    input[edge.targetValue || ''] = value;
  }

  return isObjectEmpty(input) ? node.defaultInput || {} : input;
}
