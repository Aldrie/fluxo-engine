import { isLoopNode } from './node';
import { UnknowEnum } from './types/core';
import { Edge } from './types/edge';
import { Executor } from './types/executor';
import { Node } from './types/node';

export function getSubFlow(
  loopNode: Node,
  allNodes: Node[],
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
      const child = allNodes.find((n) => n.id === edge.target);
      if (!child || visited.has(child.id)) continue;

      subFlowNodes.push(child);
      dfs(child);

      if (!isLoopNode(child, executors)) {
        resumeNodes.push(child);
      }
    }
  }

  dfs(loopNode);
  return { subFlowNodes, resumeNodes };
}
