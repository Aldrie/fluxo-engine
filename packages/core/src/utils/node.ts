import getLogger from '../logger';
import { ExecutionContext, IterationContext } from '../types/context';
import { UnknowEnum } from '../types/core';
import { ExecutorBehavior } from '../types/enums/ExecutorBehavior';
import { Executor } from '../types/executor';
import { Node } from '../types/node';

export function isLoopNode(node: Node, executors: Executor<UnknowEnum>[]) {
  const foundExecutor = executors.find((e) => e.type === node.type);
  return foundExecutor?.behavior === ExecutorBehavior.LOOP;
}

export function getOutputKey(node: Node, iterationContext: IterationContext = []): string {
  return iterationContext.length ? `${node.id}_${iterationContext.join('_')}` : node.id;
}

const log = getLogger('Node');

export function getNextNode<NodeType extends UnknowEnum>(
  context: ExecutionContext<NodeType>
): Node<NodeType> | undefined {
  const {
    currentNode,
    sortedNodes,
    nodeIndexMap,
    executedNodeOutputs,
    iterationContext,
    executorByType,
  } = {
    currentNode: context.node,
    ...context,
  };

  const iteration = iterationContext?.at(-1);
  const currentKey = getOutputKey(currentNode, iterationContext);

  if (
    iteration !== undefined &&
    executedNodeOutputs.get(`branchCompleted_${currentKey}`)?.completed
  ) {
    log(
      `getNextNode: branch already completed for node "${currentNode.id}" in iteration ${iteration}`
    );

    return undefined;
  }

  if (
    iteration !== undefined &&
    executedNodeOutputs.get(`${currentNode.id}_${iteration}`)?.branchHandled
  ) {
    log(
      `getNextNode: node "${currentNode.id}" already handled (branchHandled) in iteration ${iteration}`
    );

    return undefined;
  }

  const currentExecutor = executorByType!.get(currentNode.type);
  const currentOutput = executedNodeOutputs.get(currentNode.id);

  if (
    (currentExecutor &&
      (currentExecutor.behavior === ExecutorBehavior.BRANCH ||
        currentExecutor.behavior === ExecutorBehavior.LOOP)) ||
    (currentOutput && (currentOutput as any)?.executedBranch === true)
  ) {
    log(`getNextNode: current node "${currentNode.id}" is branch/loop or marked executedBranch`);
    return undefined;
  }

  const currentIndex = nodeIndexMap!.get(currentNode.id)!;

  for (let i = currentIndex + 1; i < sortedNodes.length; i++) {
    const next = sortedNodes[i];
    const output = executedNodeOutputs.get(next.id);

    if (output !== undefined && (output as any).skipped === true) {
      log(`getNextNode: node "${next.id}" is marked as skipped, ignoring.`);
      continue;
    }

    if (
      iteration !== undefined &&
      executedNodeOutputs.get(`${next.id}_${iteration}`)?.branchHandled
    ) {
      log(`getNextNode: node "${next.id}" is branchHandled for iteration ${iteration}, ignoring.`);
      continue;
    }

    if (output === undefined) {
      const deps = context.inputEdgesMap?.get(next.id) ?? [];

      let canRun = true;
      let mustSkip = false;

      for (const edge of deps) {
        const baseOut = executedNodeOutputs.get(edge.source);
        const iterKey = iteration !== undefined ? `${edge.source}_${iteration}` : null;
        const iterOut = iterKey ? executedNodeOutputs.get(iterKey) : undefined;
        const depOut = (iterOut ?? baseOut) as any;

        if (depOut === undefined) {
          canRun = false;
          break;
        }

        if (depOut && typeof depOut === 'object' && depOut.skipped === true) {
          mustSkip = true;
          break;
        }
      }

      if (mustSkip) {
        const key = getOutputKey(next, iterationContext);
        executedNodeOutputs.set(key, { skipped: true } as any);
        log(`getNextNode: marking "${next.id}" as skipped due to skipped dependency.`);
        continue;
      }

      if (!canRun) {
        log(`getNextNode: "${next.id}" has unresolved deps; trying next.`);
        continue;
      }

      log(`getNextNode: next candidate node found: "${next.id}"`);
      return next;
    }
  }

  for (let i = 0; i < sortedNodes.length; i++) {
    const next = sortedNodes[i];
    const output = executedNodeOutputs.get(next.id);

    if (output === undefined) {
      log(`getNextNode: fallback candidate node found: "${next.id}"`);
      return next;
    }
  }

  log(`getNextNode: no next candidate found after "${currentNode.id}"`);
  return undefined;
}
