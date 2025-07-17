import { ExecutionContextCache } from './types/context';
import { UnknowEnum } from './types/core';
import { Executor } from './types/executor';
import { Node } from './types/node';
import { isLoopNode } from './utils/node';

export interface GetSubFlowOptions<NodeType extends UnknowEnum>
  extends Pick<ExecutionContextCache<NodeType>, 'outputEdgesMap' | 'nodeIndexMap'> {
  loopNode: Node<NodeType>;
  sortedNodes: Node<NodeType>[];
  executors?: Executor<NodeType>[];
}

export function getSubFlow<NodeType extends UnknowEnum>({
  loopNode,
  sortedNodes,
  executors = [],
  outputEdgesMap,
  nodeIndexMap,
}: GetSubFlowOptions<NodeType>): {
  subFlowNodes: Node[];
  resumeNodes: Node[];
} {
  const subFlowNodes: Node[] = [loopNode];
  const visited = new Set<string>();
  const resumeNodes: Node[] = [];

  function dfs(current: Node) {
    visited.add(current.id);

    const outEdges = outputEdgesMap.get(current.id) ?? [];
    for (const edge of outEdges) {
      const idx = nodeIndexMap.get(edge.target)!;
      const child = sortedNodes[idx];
      if (!child || visited.has(child.id)) continue;

      subFlowNodes.push(child);

      if (!isLoopNode(child, executors)) {
        dfs(child);
        resumeNodes.push(child);
      }
    }
  }

  dfs(loopNode);

  subFlowNodes.sort((a, b) => nodeIndexMap.get(a.id)! - nodeIndexMap.get(b.id)!);

  return { subFlowNodes, resumeNodes };
}
