import { UnknowEnum } from './types/core';
import { Edge } from './types/edge';
import { Executor } from './types/executor';
import { Node } from './types/node';
import { isLoopNode } from './utils/node';

export function getSubFlow(
  loopNode: Node,
  sortedNodes: Node[],
  edges: Edge[],
  executors: Executor<UnknowEnum>[] = []
): {
  subFlowNodes: Node[];
  resumeNodes: Node[];
} {
  const subFlowNodes: Node[] = [loopNode];
  const visited = new Set<string>();
  const resumeNodes: Node[] = [];

  function dfs(current: Node) {
    visited.add(current.id);

    const childEdges = edges.filter((e) => e.source === current.id);

    for (const edge of childEdges) {
      const child = sortedNodes.find((n) => n.id === edge.target);
      if (!child || visited.has(child.id)) continue;

      subFlowNodes.push(child);
      dfs(child);

      if (!isLoopNode(child, executors)) {
        resumeNodes.push(child);
      }
    }
  }

  dfs(loopNode);

  const sortedOrderMap = new Map(sortedNodes.map((node, index) => [node.id, index]));

  return {
    subFlowNodes: subFlowNodes.sort((a, b) => {
      return (sortedOrderMap.get(a.id) || 0) - (sortedOrderMap.get(b.id) || 0);
    }),
    resumeNodes,
  };
}
