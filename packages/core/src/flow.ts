import { UnknowEnum } from './types/core';
import { Edge } from './types/edge';
import { Executor } from './types/executor';
import { Node } from './types/node';
import { isLoopNode } from './utils/node';

export interface GetSubFlowOptions<NodeType extends UnknowEnum> {
  loopNode: Node<NodeType>;
  sortedNodes: Node<NodeType>[];
  edges: Edge[];
  executors?: Executor<NodeType>[];
}

export function getSubFlow<NodeType extends UnknowEnum>({
  loopNode,
  sortedNodes,
  edges,
  executors = [],
}: GetSubFlowOptions<NodeType>): {
  subFlowNodes: Node[];
  resumeNodes: Node[];
} {
  const subFlowNodes: Node[] = [loopNode];
  const visited = new Set<string>();
  const resumeNodes: Node[] = [];

  function dfs(current: Node) {
    visited.add(current.id);

    for (const edge of edges.filter((e) => e.source === current.id)) {
      const child = sortedNodes.find((n) => n.id === edge.target);
      if (!child || visited.has(child.id)) continue;

      subFlowNodes.push(child);

      if (!isLoopNode(child, executors)) {
        dfs(child);
        resumeNodes.push(child);
      }
    }
  }

  dfs(loopNode);

  const indexOf = new Map(sortedNodes.map((n, i) => [n.id, i]));
  subFlowNodes.sort((a, b) => indexOf.get(a.id)! - indexOf.get(b.id)!);

  return { subFlowNodes, resumeNodes };
}
