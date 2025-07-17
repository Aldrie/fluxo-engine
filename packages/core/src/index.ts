export * from './flow';

export * from './types/context';
export * from './types/edge';
export * from './types/enums/ExecutorBehavior';
export * from './types/enums/ValueTypes';
export * from './types/executor';
export * from './types/flow';
export * from './types/node';
export * from './types/snapshot';
export * from './types/value';

import { ExecutedNodeOutputs, UnknowEnum } from './types/core';
import { ConvertValuesToObject, Value } from './types/value';
import { ValueTypes } from './types/enums/ValueTypes';

import {
  Flow,
  FlowExecutionResult,
  FlowExecutionStatus,
  FlowHandlerOptions,
  ResumeFlowOptions,
} from './types/flow';

import { objectToMap } from './utils/map';
import { FluxoWaitSignal } from './wait-signal';
import getLogger, { setIsLoggerEnabled } from './logger';
import { executeNode, getInitialNodeIds, getNextNode, getSortedNodes } from './node';

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
  const initialNodeIds = forcedInitialNodeIds ?? getInitialNodeIds(sortedNodes, edges);

  log('sortedNodes', sortedNodes);
  log('initialNodeIds', initialNodeIds);

  for (const nodeId of initialNodeIds) {
    const node = nodeMap.get(nodeId)!;

    await executeNode({
      node,
      edges,
      executors,
      sortedNodes,
      executedNodeOutputs,
      initialNodeIds,
      iterationContext: [],
    });
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
          snapshot: error.snapshot ?? { executedNodeOutputs: {}, pending: [] },
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

    const pendingEntry = snapshot.pending.find((p) => p.nodeId === resolved.nodeId);
    const iterationContext = pendingEntry?.iteration ?? [];

    const key =
      iterationContext.length > 0
        ? `${resolved.nodeId}_${iterationContext.join('_')}`
        : resolved.nodeId;

    executedNodeOutputs.set(key, resolved.output);

    if (iterationContext.length) {
      const agg = Array.isArray(executedNodeOutputs.get(resolved.nodeId))
        ? [...(executedNodeOutputs.get(resolved.nodeId) as any[])]
        : [];

      agg[iterationContext.at(-1)!] = resolved.output;
      executedNodeOutputs.set(resolved.nodeId, agg as any);
    }

    snapshot.pending = snapshot.pending.filter((p) => p !== pendingEntry);

    const sortedNodes = getSortedNodes(nodes, edges, executors);
    const waitNode = nodes.find((n) => n.id === resolved.nodeId)!;

    const nextNode = getNextNode({
      node: waitNode,
      edges,
      executors,
      sortedNodes,
      executedNodeOutputs,
      initialNodeIds: [],
      iterationContext,
    });

    if (nextNode) {
      await executeNode({
        node: nextNode,
        edges,
        executors,
        sortedNodes,
        executedNodeOutputs,
        initialNodeIds: [],
        iterationContext,
      });
    }

    try {
      await executeFlow({
        executors,
        nodes,
        edges,
        executedNodeOutputs,
      });

      return { status: FlowExecutionStatus.COMPLETED, snapshot: null };
    } catch (error) {
      if (error instanceof FluxoWaitSignal) {
        return {
          status: FlowExecutionStatus.WAITING,
          snapshot: error.snapshot ?? { executedNodeOutputs: {}, pending: [] },
        };
      }

      throw error;
    }
  }

  return { execute, resume };
}
