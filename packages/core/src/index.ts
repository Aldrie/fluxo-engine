export * from './flow';
export * from './types/edge';
export * from './types/enums/ValueTypes';
export * from './types/enums/ExecutorBehavior';
export * from './types/executor';
export * from './types/flow';
export * from './types/node';
export * from './types/value';
export * from './types/context';

import getLogger, { setIsLoggerEnabled } from './logger';
import { executeNode, getInitialNodeIds, getSortedNodes } from './node';
import { ExecutedNodeOutputs, UnknowEnum } from './types/core';

import { ValueTypes } from './types/enums/ValueTypes';
import { Flow, FlowHandlerOptions } from './types/flow';
import { ConvertValuesToObject, Value } from './types/value';

const log = getLogger('Index');

export async function executeFlow<NodeType extends UnknowEnum>({
  executors,
  nodes,
  edges,
  executedNodeOutputs,
}: Flow<NodeType, ConvertValuesToObject<Value<string, ValueTypes>>> &
  FlowHandlerOptions<NodeType> & {
    executedNodeOutputs: ExecutedNodeOutputs;
  }) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const sortedNodes = getSortedNodes(nodes, edges, executors);
  log('sortedNodes', sortedNodes);
  const initialNodeIds = getInitialNodeIds(sortedNodes, edges);

  for (const nodeId of initialNodeIds) {
    const node = nodeMap.get(nodeId)!;
    await executeNode(node, edges, executors, sortedNodes, executedNodeOutputs, initialNodeIds);
  }
}

export function getFlowHandler<NodeType extends UnknowEnum>({
  executors,
  enableLogger = false,
}: FlowHandlerOptions<NodeType>) {
  setIsLoggerEnabled(enableLogger);

  async function execute<
    InitialData extends Value<string, ValueTypes> = Value<string, ValueTypes>,
  >({ nodes, edges }: Flow<NodeType, ConvertValuesToObject<InitialData>>) {
    const executedNodeOutputs: ExecutedNodeOutputs = new Map();
    log('nodes', nodes);
    log('edges', edges);
    await executeFlow({ executors, nodes, edges, executedNodeOutputs });
  }

  return { execute };
}
