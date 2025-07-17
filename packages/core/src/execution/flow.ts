import { FluxoWaitSignalException } from '../exceptions/wait-signal-exception';
import getLogger from '../logger';
import { ExecutionContextCache } from '../types/context';
import { ExecutedNodeOutputs, UnknowEnum } from '../types/core';
import { Edge } from '../types/edge';
import { ValueTypes } from '../types/enums/ValueTypes';
import { ExecuteFlowOptions, FlowExecutionResult, FlowExecutionStatus } from '../types/flow';
import { ConvertValuesToObject, Value } from '../types/value';
import { getInitialNodeIds } from '../utils/graph';
import { executeNode } from './node';

const log = getLogger('FlowHandler');

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

export async function runFlow<NodeType extends UnknowEnum>(
  executors: any[],
  nodes: any[],
  edges: Edge[],
  executedNodeOutputs: ExecutedNodeOutputs,
  executionContextCache: ExecutionContextCache<NodeType>
): Promise<FlowExecutionResult> {
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
    if (error instanceof FluxoWaitSignalException) {
      return {
        status: FlowExecutionStatus.WAITING,
        snapshot: error.snapshot ?? { executedNodeOutputs: {}, pending: [] },
      };
    }
    throw error;
  }
}
