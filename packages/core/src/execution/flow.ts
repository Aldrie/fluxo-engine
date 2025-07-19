import { FluxoWaitSignalException } from '../exceptions/wait-signal-exception';
import getLogger from '../logger';
import { ExecutionContextCache } from '../types/context';
import { ExecutedNodeOutputs, UnknowEnum } from '../types/core';
import { Edge } from '../types/edge';
import { ValueTypes } from '../types/enums/ValueTypes';
import {
  ExecuteFlowOptions,
  FlowExecutionResult,
  FlowExecutionStatus,
  ResumeEntry,
} from '../types/flow';
import { ExecutionSnapshot } from '../types/snapshot';
import { ConvertValuesToObject, Value } from '../types/value';
import { getInitialNodeIds } from '../utils/graph';
import { mapToObject } from '../utils/map';
import { getNextNode } from '../utils/node';
import { executeNode } from './node';

const log = getLogger('FlowHandler');

async function execute<NodeType extends UnknowEnum>({
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

export async function executeFlow<NodeType extends UnknowEnum>(
  executors: any[],
  nodes: any[],
  edges: Edge[],
  executedNodeOutputs: ExecutedNodeOutputs,
  executionContextCache: ExecutionContextCache<NodeType>
): Promise<FlowExecutionResult> {
  try {
    await execute({
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

interface ResumeFlowOptions<NodeType extends UnknowEnum>
  extends Omit<
    ExecuteFlowOptions<NodeType, ConvertValuesToObject<Value<string, ValueTypes>>>,
    'initialNodeIds' | 'initialData'
  > {
  resumeEntries: ResumeEntry[];
  snapshot: ExecutionSnapshot;
}

export async function resumeFlow<NodeType extends UnknowEnum>({
  nodes,
  edges,
  executors,
  executedNodeOutputs,
  executionContextCache,
  resumeEntries,
  snapshot,
}: ResumeFlowOptions<NodeType>): Promise<FlowExecutionResult> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const resolvedKeys = new Set(
    resumeEntries.map((r) => `${r.nodeId}|${r.iterationContext.join(',')}`)
  );

  for (const { nodeId, iterationContext } of resumeEntries) {
    const waitNode = nodeMap.get(nodeId)!;

    const next = getNextNode({
      node: waitNode,
      edges,
      executors,
      executedNodeOutputs,
      initialNodeIds: [],
      iterationContext,
      ...executionContextCache,
    });

    if (next) {
      await executeNode({
        node: next,
        edges,
        executors,
        executedNodeOutputs,
        initialNodeIds: [],
        iterationContext,
        ...executionContextCache,
      });
    }
  }

  const newPending = snapshot.pending.filter(
    (p) => !resolvedKeys.has(`${p.nodeId}|${p.iteration.join(',')}`)
  );

  if (newPending.length > 0) {
    return {
      status: FlowExecutionStatus.WAITING,
      snapshot: {
        executedNodeOutputs: mapToObject(executedNodeOutputs),
        pending: newPending,
      },
    };
  }

  return { status: FlowExecutionStatus.COMPLETED, snapshot: null };
}
