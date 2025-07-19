import { ExecutionContextCache } from '../types/context';
import { UnknowEnum } from '../types/core';
import { BranchEdge, Edge } from '../types/edge';
import { Executor } from '../types/executor';
import { Node } from '../types/node';
import { isBranchEdge } from './edge-mapping';
import { getSortedNodes } from './graph';

interface BuildExecutionContextCacheOptions<NodeType extends UnknowEnum> {
  nodes: Node<NodeType>[];
  edges: Edge[];
  executors: Executor<NodeType>[];
}

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
