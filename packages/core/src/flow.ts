import { Edge } from './types/edge';
import { Node } from './types/node';

export function getSubFlow(
  loopNode: Node,
  allNodes: Node[],
  edges: Edge[]
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

      if (!child.isLoop) {
        resumeNodes.push(child);
      }
    }
  }

  dfs(loopNode);
  return { subFlowNodes, resumeNodes };
}
