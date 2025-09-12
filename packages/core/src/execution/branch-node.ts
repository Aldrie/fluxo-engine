import { ExecutionContext } from '../types/context';
import { UnknowEnum } from '../types/core';
import { BranchExecutor } from '../types/executor';
import { isBranchEdge, mapNodeOutputsToInput } from '../utils/edge-mapping';
import { getOutputKey } from '../utils/node';

interface BranchOptions<NodeType extends UnknowEnum> extends ExecutionContext<NodeType> {
  currentExecutor: BranchExecutor<NodeType>;
}

export async function executeBranchNode<NodeType extends UnknowEnum>(
  opts: BranchOptions<NodeType>,
  resumeExecution: (ctx: ExecutionContext<NodeType>) => Promise<any>
) {
  const {
    node,
    edges,
    inputEdgesMap,
    currentExecutor,
    sortedNodes,
    executedNodeOutputs,
    iterationContext = [],
    branchEdgesMap,
  } = opts;

  const branchOuts = branchEdgesMap!.get(node.id) ?? [];

  const iter = iterationContext.at(-1);

  const input = mapNodeOutputsToInput({
    node,
    inputEdgesMap,
    executedNodeOutputs,
    iteration: iter,
  });

  let decision: boolean;

  if (typeof (input as any).num0 === 'string') {
    const trueEdge = edges.find(
      (e) => isBranchEdge(e) && e.source === node.id && e.branch === currentExecutor.getTrueKey()
    );

    if (!trueEdge) {
      throw new Error(`No true-branch edge found for node "${node.id}"`);
    }

    const trueNode = sortedNodes.find((n) => n.id === trueEdge.target)!;
    const trueDefault = (trueNode.data as any).defaultValue;

    decision = (input as any).num0 === trueDefault;
  } else {
    decision = await currentExecutor.executeBranch(input, node.data);
  }

  const branchKey = decision ? currentExecutor.getTrueKey() : currentExecutor.getFalseKey();

  const nextEdge = branchOuts.find((e) => e.branch === branchKey);

  const outputKey = getOutputKey(node, iterationContext);

  if (!nextEdge) {
    executedNodeOutputs.set(outputKey, { result: decision, executedBranch: true });

    for (const be of branchOuts) {
      const skipKey = iter !== undefined ? `${be.target}_${iter}` : be.target;
      executedNodeOutputs.set(skipKey, { skipped: true });
    }

    return decision;
  }

  const branchOutput = { result: decision, executedBranch: true };

  if (iter !== undefined) {
    executedNodeOutputs.set(`${node.id}_${iter}`, branchOutput);
  } else {
    executedNodeOutputs.set(node.id, branchOutput);
  }

  for (const be of branchOuts) {
    if (be.branch !== branchKey) {
      const key = iter !== undefined ? `${be.target}_${iter}` : be.target;
      executedNodeOutputs.set(key, { skipped: true });
    }
  }

  const targetNode = sortedNodes.find((n) => n.id === nextEdge.target)!;
  const deps = (inputEdgesMap!.get(targetNode.id) ?? []).map((e) => e.source);

  const firstUnresolvedDepId = deps.find((depId) => {
    const baseOut = executedNodeOutputs.get(depId);
    const iterKey = iter !== undefined ? `${depId}_${iter}` : null;
    const iterOut = iterKey ? executedNodeOutputs.get(iterKey) : undefined;
    return (iterOut ?? baseOut) === undefined;
  });

  if (firstUnresolvedDepId) {
    const depNode = sortedNodes.find((n) => n.id === firstUnresolvedDepId)!;
    await resumeExecution({ ...opts, node: depNode, iterationContext });
  } else {
    await resumeExecution({ ...opts, node: targetNode, iterationContext });
  }

  return decision;
}
