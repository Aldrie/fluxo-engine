import { executeNode, getNextNode } from './node';
import { ExecutionContext } from '../types/context';
import { UnknowEnum } from '../types/core';
import { NodeExecutor } from '../types/executor';
import { mapNodeOutputsToInput } from '../utils/edge-mapping';
import { getOutputKey } from '../utils/node';

interface DefaultNodeOptions<NodeType extends UnknowEnum> extends ExecutionContext<NodeType> {
  currentExecutor: NodeExecutor<NodeType>;
}

export async function executeDefaultNode<NodeType extends UnknowEnum>(
  opts: DefaultNodeOptions<NodeType>
): Promise<any> {
  const {
    node,
    inputEdgesMap,
    currentExecutor,
    executedNodeOutputs,
    initialNodeIds,
    iterationContext = [],
  } = opts;

  const iter = iterationContext.at(-1);

  let iterationCount: number | undefined;

  const inEdges = inputEdgesMap!.get(node.id) ?? [];

  for (const e of inEdges) {
    const out = executedNodeOutputs.get(e.source);
    if (Array.isArray(out)) {
      iterationCount = out.length;
      break;
    }
  }

  if (iterationCount !== undefined && iter === undefined) {
    const agg: any[] = [];

    for (let i = 0; i < iterationCount; i++) {
      const input = mapNodeOutputsToInput({
        node,
        inputEdgesMap,
        executedNodeOutputs,
        iteration: i,
      });
      const out = await currentExecutor.execute(input, node.data);

      agg.push(out);

      executedNodeOutputs.set(getOutputKey(node, [...iterationContext, i]), out);
    }

    executedNodeOutputs.set(node.id, agg as any);

    const next = getNextNode({ ...opts, node, iterationContext });

    if (next && !initialNodeIds.includes(next.id)) {
      await executeNode({ ...opts, node: next });
    }

    return agg;
  }

  const input = mapNodeOutputsToInput({
    node,
    inputEdgesMap,
    executedNodeOutputs,
    iteration: iter,
  });
  const output = await currentExecutor.execute(input, node.data);

  if (iter !== undefined) {
    executedNodeOutputs.set(getOutputKey(node, iterationContext), output);

    const arr = Array.isArray(executedNodeOutputs.get(node.id))
      ? [...(executedNodeOutputs.get(node.id) as unknown as any[])]
      : [];

    arr.push(output);
    executedNodeOutputs.set(node.id, arr as any);
  } else {
    executedNodeOutputs.set(node.id, output);
  }

  const next = getNextNode({ ...opts, node, iterationContext });

  if (iter === undefined && next && !initialNodeIds.includes(next.id)) {
    await executeNode({ ...opts, node: next });
  }

  return output;
}
