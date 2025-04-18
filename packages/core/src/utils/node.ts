import { IterationContext } from '../types/context';
import { UnknowEnum } from '../types/core';
import { ExecutorBehavior } from '../types/enums/ExecutorBehavior';
import { Executor } from '../types/executor';
import { Node } from '../types/node';

export function isLoopNode(node: Node, executors: Executor<UnknowEnum>[]) {
  const foundExecutor = executors.find((e) => e.type === node.type);
  return foundExecutor?.behavior === ExecutorBehavior.LOOP;
}

export function getOutputKey(node: Node, iterationContext: IterationContext = []) {
  return iterationContext.length > 0 ? `${node.id}_${iterationContext.join('_')}` : node.id;
}
