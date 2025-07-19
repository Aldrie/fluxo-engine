import { FluxoWaitSignalException } from '../exceptions/wait-signal-exception';
import getLogger from '../logger';
import { ExecutionContext } from '../types/context';
import { UnknowEnum } from '../types/core';
import { LoopNodeExecutor } from '../types/executor';
import { ExecutionSnapshot, PendingWait } from '../types/snapshot';
import { mapNodeOutputsToInput } from '../utils/edge-mapping';
import { getSubFlow } from '../utils/flow';
import { mapToObject } from '../utils/map';
import { getNextNode, getOutputKey } from '../utils/node';

interface LoopOptions<NodeType extends UnknowEnum> extends ExecutionContext<NodeType> {
  currentExecutor: LoopNodeExecutor<NodeType>;
}

const log = getLogger('LoopNode');

export async function executeLoopNode<NodeType extends UnknowEnum>(
  opts: LoopOptions<NodeType>,
  resumeExecution: (ctx: ExecutionContext<NodeType>) => Promise<any>
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

    if (next) await resumeExecution({ ...opts, node: next, iterationContext });

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

  const pending: PendingWait[] = [];

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

    let didWait = false;
    for (const child of childExecNodes) {
      try {
        await resumeExecution({
          ...opts,
          node: child,
          iterationContext: newIterationContext,
        });
      } catch (err: any) {
        if (err instanceof FluxoWaitSignalException) {
          pending.push({ nodeId: child.id, iteration: newIterationContext });
          didWait = true;
          break;
        }
        throw err;
      }
    }

    if (didWait) {
      continue;
    }

    log(`${prefix} iter ${i} done`);
    executedNodeOutputs.set(iterDoneKey(i), true as any);
  }

  if (pending.length > 0) {
    const snapshot: ExecutionSnapshot = {
      executedNodeOutputs: mapToObject(executedNodeOutputs),
      pending,
    };
    log(`${prefix} accumulated pending:`, JSON.stringify(pending, null, 2));
    throw new FluxoWaitSignalException(snapshot);
  }

  executedNodeOutputs.set(doneKey, true as any);
  log(`${prefix} all iterations done — exiting loop`);

  return arr;
}
