import { FluxoWaitSignalException } from '../exceptions/wait-signal-exception';
import getLogger from '../logger';
import { ExecutionContext } from '../types/context';
import { UnknowEnum } from '../types/core';
import { ExecutorBehavior } from '../types/enums/ExecutorBehavior';
import { BranchExecutor, LoopNodeExecutor, NodeExecutor, WaitExecutor } from '../types/executor';
import { getOutputKey } from '../utils/node';
import { executeBranchNode } from './branch-node';
import { executeDefaultNode } from './default-node';
import { executeLoopNode } from './loop-node';
import { executeWaitNode } from './wait-node';

const log = getLogger('Node');

function isSkipped(out: any) {
  return !!out && typeof out === 'object' && out.skipped === true;
}

export async function executeNode<NodeType extends UnknowEnum>(
  context: ExecutionContext<NodeType>
): Promise<any> {
  const { node, executedNodeOutputs, iterationContext = [], executorByType } = context;

  const executor = executorByType!.get(node.type);
  if (!executor) throw new Error(`No executor for ${node.type}`);

  log(`executing ${node.id}`, iterationContext);

  const key = getOutputKey(node, iterationContext);

  if (
    executor.behavior !== ExecutorBehavior.LOOP &&
    (isSkipped(executedNodeOutputs.get(node.id)) || isSkipped(executedNodeOutputs.get(key)))
  ) {
    executedNodeOutputs.set(key, { skipped: true } as any);
    return;
  }

  const hasSkippedDependency = context.edges
    .filter((e) => e.target === node.id)
    .some((e) => {
      const baseOut = executedNodeOutputs.get(e.source);
      const iterKey = iterationContext.length > 0 ? `${e.source}_${iterationContext.at(-1)}` : null;
      const iterOut = iterKey ? executedNodeOutputs.get(iterKey) : undefined;

      return isSkipped(iterOut ?? baseOut);
    });

  if (hasSkippedDependency) {
    executedNodeOutputs.set(key, { skipped: true } as any);
    return;
  }

  if (executedNodeOutputs.has(key)) {
    if (executor.behavior === ExecutorBehavior.LOOP) {
      const completed = executedNodeOutputs.get(`${node.id}_loopCompleted`);

      if (iterationContext.length > 0) {
        log(`Skipping ${key} (loop iteration already done)`);
        return executedNodeOutputs.get(key);
      }

      if (completed) {
        log(`Skipping ${key} (loop completed)`);
        return executedNodeOutputs.get(key);
      }
    } else {
      log(`Skipping ${key}`);
      return executedNodeOutputs.get(key);
    }
  }

  if (executor.behavior === ExecutorBehavior.WAIT) {
    try {
      await executeWaitNode(
        { ...context, executor: executor as WaitExecutor<NodeType>, key },
        executeNode
      );
    } catch (e) {
      if (e instanceof FluxoWaitSignalException) throw e;
      throw e;
    }

    return;
  }

  if (executor.behavior === ExecutorBehavior.BRANCH) {
    return executeBranchNode(
      {
        ...context,
        currentExecutor: executor as BranchExecutor<NodeType>,
      },
      executeNode
    );
  }

  if (executor.behavior === ExecutorBehavior.LOOP) {
    return executeLoopNode(
      {
        ...context,
        currentExecutor: executor as LoopNodeExecutor<NodeType>,
      },
      executeNode
    );
  }

  return executeDefaultNode(
    {
      ...context,
      currentExecutor: executor as NodeExecutor<NodeType>,
    },
    executeNode
  );
}
