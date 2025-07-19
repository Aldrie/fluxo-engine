import { isLoopNode } from './node';
import { UnknowEnum } from '../types/core';
import { Edge } from '../types/edge';
import { Executor } from '../types/executor';
import { Node } from '../types/node';

function topologicalSort(
  nodes: Node[],
  edges: Edge[],
  executors: Executor<UnknowEnum>[] = []
): string[] {
  const adjacencyList: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};

  nodes.forEach((node) => {
    adjacencyList[node.id] = [];
    inDegree[node.id] = 0;
  });

  edges.forEach((edge) => {
    adjacencyList[edge.source].push(edge.target);
    inDegree[edge.target] += 1;
  });

  const loopNodeIds = new Set<string>();

  for (const n of nodes) {
    if (isLoopNode(n, executors)) loopNodeIds.add(n.id);
  }

  const compareLoop = (a: string, b: string) => {
    const aIs = loopNodeIds.has(a),
      bIs = loopNodeIds.has(b);
    return aIs === bIs ? 0 : aIs ? 1 : -1;
  };

  const queue: string[] = nodes
    .filter((n) => inDegree[n.id] === 0)
    .map((n) => n.id)
    .sort(compareLoop);

  const sortedOrder: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sortedOrder.push(current);
    for (const neighbor of adjacencyList[current]) {
      inDegree[neighbor] -= 1;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
    queue.sort(compareLoop);
  }

  if (sortedOrder.length !== nodes.length) {
    throw new Error('Graph contains cycles!');
  }
  return sortedOrder;
}

function createNodeMap(nodes: Node[]): Map<string, Node> {
  return new Map(nodes.map((n) => [n.id, n]));
}

export function getSortedNodes<NodeType extends UnknowEnum>(
  nodes: Node<NodeType>[],
  edges: Edge[],
  executors: Executor<NodeType>[]
): Node[] {
  const sortedOrder = topologicalSort(nodes, edges, executors);
  const nodeMap = createNodeMap(nodes);
  return sortedOrder.map((id) => nodeMap.get(id)!).filter(Boolean);
}

export function getInitialNodeIds<NodeType extends UnknowEnum>(
  nodes: Node<NodeType>[],
  edges: Edge[]
): string[] {
  return nodes
    .filter((node) => !edges.some((edge) => edge.target === node.id))
    .map((node) => node.id);
}
