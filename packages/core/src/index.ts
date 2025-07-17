export * from './utils/flow';

export * from './types/context';
export * from './types/edge';
export * from './types/enums/ExecutorBehavior';
export * from './types/enums/ValueTypes';
export * from './types/executor';
export * from './types/flow';
export * from './types/node';
export * from './types/snapshot';
export * from './types/value';

import { buildExecutionContextCache } from './execution/execution-context';
import { executeNode, getNextNode } from './execution/node';
import { runFlow } from './execution/flow';

import { ExecutedNodeOutputs, UnknowEnum } from './types/core';
import { ValueTypes } from './types/enums/ValueTypes';
import { ConvertValuesToObject, Value } from './types/value';
import { Flow, FlowExecutionResult, FlowHandlerOptions, ResumeFlowOptions } from './types/flow';

import { objectToMap } from './utils/map';

import { setIsLoggerEnabled } from './logger';

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

    return runFlow(executors, nodes, edges, executedNodeOutputs, executionContextCache);
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

    return runFlow(executors, nodes, edges, executedNodeOutputs, executionContextCache);
  }

  return { execute, resume };
}
