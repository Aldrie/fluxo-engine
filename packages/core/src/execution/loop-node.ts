import getLogger from '../logger';
import { executeNode, getNextNode } from './node';
import { ExecutionContext } from '../types/context';
import { UnknowEnum } from '../types/core';
import { LoopNodeExecutor } from '../types/executor';
import { FlowExecutionStatus } from '../types/flow';
import { mapNodeOutputsToInput } from '../utils/edge-mapping';
import { getSubFlow } from '../utils/flow';
import { getOutputKey } from '../utils/node';

interface LoopOptions<NodeType extends UnknowEnum> extends ExecutionContext<NodeType> {
  currentExecutor: LoopNodeExecutor<NodeType>;
}

const log = getLogger('LoopNode');

export async function executeLoopNode<NodeType extends UnknowEnum>(
  opts: LoopOptions<NodeType>
): Promise<any> {
  const {
    node,
    inputEdgesMap,
    currentExecutor,
    sortedNodes,
    executedNodeOutputs,
    iterationContext = [],
    executors,
    outputEdgesMap,
    nodeIndexMap,
  } = opts;

  const prefix = `[LOOP ${node.id}]`;
  const ctxKey = getOutputKey(node, iterationContext);
  const doneKey = `${ctxKey}_loopCompleted`;

  const iterKey = (i: number) => `${ctxKey}_${i}`;

  const iterDoneKey = (i: number) => `${ctxKey}_${i}_done`;
  const iterDone = (i: number) => executedNodeOutputs.has(iterDoneKey(i));

  if (executedNodeOutputs.has(doneKey)) {
    log(`${prefix} already completed`);

    const next = getNextNode({ ...opts, node, iterationContext });

    if (next) await executeNode({ ...opts, node: next, iterationContext });

    return executedNodeOutputs.get(node.id);
  }

  const input = mapNodeOutputsToInput({
    node,
    inputEdgesMap,
    executedNodeOutputs,
    iteration: iterationContext.at(-1),
  });

  const arr = await currentExecutor.getArray(input, node.data, iterationContext.at(-1));
  if (!Array.isArray(arr)) throw new Error('Loop must return an array');

  executedNodeOutputs.set(node.id, arr as any);
  log(`${prefix} array len ${arr.length}`);

  const { subFlowNodes } = getSubFlow({
    loopNode: node,
    sortedNodes,
    executors,
    outputEdgesMap,
    nodeIndexMap,
  });

  const bodyIds = new Set(subFlowNodes.map((n) => n.id));
  bodyIds.delete(node.id);

  const childExecNodes = sortedNodes.filter((n) => bodyIds.has(n.id));

  log(
    `${prefix} body nodes:`,
    childExecNodes.map((n) => n.id)
  );

  for (let i = 0; i < arr.length; i++) {
    if (iterDone(i)) {
      log(`${prefix} iter ${i} already done, skipping`);
      continue;
    }

    const newIterationContext = [...iterationContext, i];

    executedNodeOutputs.set(iterKey(i), arr[i]);
    log(`${prefix} iter ${i} start`);

    for (const child of childExecNodes) {
      const res = await executeNode({
        ...opts,
        node: child,
        iterationContext: newIterationContext,
      });

      if (res?.status === FlowExecutionStatus.WAITING) {
        return res;
      }
    }

    log(`${prefix} iter ${i} done`);

    executedNodeOutputs.set(iterDoneKey(i), true as any);
  }

  executedNodeOutputs.set(doneKey, true as any);
  log(`${prefix} all iterations done — exiting loop`);

  return arr;
}
