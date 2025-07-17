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
import { ValueTypes } from './types/enums/ValueTypes';
import { ConvertValuesToObject, Value } from './types/value';

import {
  BuildExecutionContextCacheOptions,
  ExecuteFlowOptions,
  Flow,
  FlowExecutionResult,
  FlowExecutionStatus,
  FlowHandlerOptions,
  ResumeFlowOptions,
} from './types/flow';

import { isBranchEdge } from './edge';
import getLogger, { setIsLoggerEnabled } from './logger';
import { executeNode, getInitialNodeIds, getNextNode, getSortedNodes } from './node';
import { BranchEdge, Edge } from './types/edge';
import { Executor } from './types/executor';
import { objectToMap } from './utils/map';
import { FluxoWaitSignal } from './wait-signal';
import { ExecutionContextCache } from './types/context';
import { Node } from './types/node';

const log = getLogger('Index');

export function buildExecutionContextCache<NodeType extends UnknowEnum>({
  nodes,
  edges,
  executors,
}: BuildExecutionContextCacheOptions<NodeType>): ExecutionContextCache<NodeType> {
  const sortedNodes = getSortedNodes(nodes, edges, executors);
  const nodeIndexMap = new Map(sortedNodes.map((n, i) => [n.id, i]));

  const executorByType = new Map<NodeType, Executor<NodeType>>(
    executors?.map((e) => [e.type, e] as const)
  );

  const inputEdgesMap = new Map<string, Edge[]>();

  for (const e of edges) {
    if (!isBranchEdge(e)) {
      const arr = inputEdgesMap.get(e.target) ?? [];
      arr.push(e);
      inputEdgesMap.set(e.target, arr);
    }
  }

  const outputEdgesMap = new Map<string, Edge[]>();
  const branchEdgesMap = new Map<string, BranchEdge[]>();

  for (const e of edges) {
    if (isBranchEdge(e)) {
      const arr = branchEdgesMap.get(e.source) ?? [];
      arr.push(e as BranchEdge);
      branchEdgesMap.set(e.source, arr);
    } else {
      const arr = outputEdgesMap.get(e.source) ?? [];
      arr.push(e);
      outputEdgesMap.set(e.source, arr);
    }
  }

  return {
    executorByType,
    inputEdgesMap,
    nodeIndexMap,
    sortedNodes: sortedNodes as Node<NodeType>[],
    outputEdgesMap,
    branchEdgesMap,
  };
}

export async function executeFlow<NodeType extends UnknowEnum>({
  nodes,
  edges,
  executors,
  executedNodeOutputs,
  initialNodeIds: forcedInitialNodeIds,
  executionContextCache,
}: ExecuteFlowOptions<NodeType, ConvertValuesToObject<Value<string, ValueTypes>>>) {
  log('nodes', nodes);
  log('edges', edges);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const initialNodeIds =
    forcedInitialNodeIds ?? getInitialNodeIds(executionContextCache?.sortedNodes, edges);

  log('sortedNodes', executionContextCache?.sortedNodes);
  log('initialNodeIds', initialNodeIds);

  for (const nodeId of initialNodeIds) {
    const node = nodeMap.get(nodeId)!;

    await executeNode({
      node,
      edges,
      executors,
      executedNodeOutputs,
      initialNodeIds,
      iterationContext: [],
      ...executionContextCache,
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

    const executionContextCache = buildExecutionContextCache({
      nodes,
      edges,
      executors,
    });

    try {
      await executeFlow({
        executors,
        nodes,
        edges,
        executedNodeOutputs,
        executionContextCache,
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

    const executionContextCache = buildExecutionContextCache({
      nodes,
      edges,
      executors,
    });

    const waitNode = nodes.find((n) => n.id === resolved.nodeId)!;

    const nextNode = getNextNode({
      node: waitNode,
      edges,
      executors,
      executedNodeOutputs,
      initialNodeIds: [],
      iterationContext,
      ...executionContextCache,
    });

    if (nextNode) {
      await executeNode({
        node: nextNode,
        edges,
        executors,
        executedNodeOutputs,
        initialNodeIds: [],
        iterationContext,
        ...executionContextCache,
      });
    }

    try {
      await executeFlow({
        executors,
        nodes,
        edges,
        executedNodeOutputs,
        executionContextCache,
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
