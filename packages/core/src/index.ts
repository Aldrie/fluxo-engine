export * from './flow';

export * from './types/edge';
export * from './types/enums/ValueTypes';
export * from './types/enums/ExecutorBehavior';
export * from './types/executor';
export * from './types/flow';
export * from './types/node';
export * from './types/value';
export * from './types/context';
export * from './types/snapshot';

import getLogger, { setIsLoggerEnabled } from './logger';
import { executeNode, getInitialNodeIds, getNextNode, getSortedNodes } from './node';
import { ExecutedNodeOutputs, UnknowEnum } from './types/core';

import { ValueTypes } from './types/enums/ValueTypes';
import {
  Flow,
  FlowExecutionResult,
  FlowExecutionStatus,
  FlowHandlerOptions,
  ResumeFlowOptions,
} from './types/flow';
import { ExecutionSnapshot } from './types/snapshot';
import { ConvertValuesToObject, Value } from './types/value';
import { mapToObject, objectToMap } from './utils/map';
import { FluxoWaitSignal } from './wait-signal';

const log = getLogger('Index');

export async function executeFlow<NodeType extends UnknowEnum>({
  executors,
  nodes,
  edges,
  executedNodeOutputs,
  initialNodeIds: forcedInitialNodeIds,
}: Flow<NodeType, ConvertValuesToObject<Value<string, ValueTypes>>> &
  FlowHandlerOptions<NodeType> & {
    executedNodeOutputs: ExecutedNodeOutputs;
  }) {
  log('nodes', nodes);
  log('edges', edges);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const sortedNodes = getSortedNodes(nodes, edges, executors);
  log('sortedNodes', sortedNodes);
  const initialNodeIds = forcedInitialNodeIds ?? getInitialNodeIds(sortedNodes, edges);

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
  >({
    nodes,
    edges,
  }: Flow<NodeType, ConvertValuesToObject<InitialData>>): Promise<FlowExecutionResult> {
    const executedNodeOutputs: ExecutedNodeOutputs = new Map();

    try {
      await executeFlow({ executors, nodes, edges, executedNodeOutputs });
      return { status: FlowExecutionStatus.COMPLETED, snapshot: null };
    } catch (error) {
      if (error instanceof FluxoWaitSignal) {
        return {
          status: FlowExecutionStatus.WAITING,
          snapshot: error.snapshot || {
            executedNodeOutputs: {},
            pending: [],
          },
        };
      }

      throw error;
    }
  }

  async function resume({
    nodes,
    edges,
    snapshot,
    resolved,
  }: ResumeFlowOptions<NodeType>): Promise<FlowExecutionResult> {
    const executedNodeOutputs = objectToMap(snapshot.executedNodeOutputs);

    executedNodeOutputs.set(resolved.nodeId, resolved.output);

    const pendingEntry = snapshot.pending.find((p) => p.nodeId === resolved.nodeId);
    const iterationContext: number[] = pendingEntry?.iteration || [];

    const sortedNodes = getSortedNodes(nodes, edges, executors);

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const waitNode = nodeMap.get(resolved.nodeId)!;

    const nextNode = getNextNode(
      waitNode,
      sortedNodes,
      executors,
      executedNodeOutputs,
      iterationContext.at(-1)
    );

    if (nextNode) {
      await executeNode(
        nextNode,
        edges,
        executors,
        sortedNodes,
        executedNodeOutputs,
        [],
        iterationContext
      );
    }

    return { status: FlowExecutionStatus.COMPLETED, snapshot: null };
  }

  return { execute, resume };
}
