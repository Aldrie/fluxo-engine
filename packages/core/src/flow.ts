/* eslint-disable @typescript-eslint/no-explicit-any */
import getLogger from './logger';
import { Edge } from './types/edge';
import { ValueTypes } from './types/enums/ValueTypes';
import { Executor } from './types/executor';
import { Flow, FlowHandlerOptions } from './types/flow';
import { Node } from './types/node';
import { ConvertValuesToObject, Value } from './types/value';

const log = getLogger({ enabled: false });

function topologicalSort(nodes: Node[], edges: Edge[]): string[] {
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

  let queue: string[] = nodes
    .filter((n) => inDegree[n.id] === 0)
    .map((n) => n.id)
    .sort((a, b) => {
      const nodeA = nodes.find((n) => n.id === a)!;
      const nodeB = nodes.find((n) => n.id === b)!;
      return nodeA.isLoop === nodeB.isLoop ? 0 : nodeA.isLoop ? 1 : -1;
    });

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

    queue = queue.sort((a, b) => {
      const nodeA = nodes.find((n) => n.id === a)!;
      const nodeB = nodes.find((n) => n.id === b)!;
      return nodeA.isLoop === nodeB.isLoop ? 0 : nodeA.isLoop ? 1 : -1;
    });
  }

  if (sortedOrder.length !== nodes.length) {
    throw new Error('Graph contains cycles!');
  }

  return sortedOrder;
}

function getSortedNodes(nodes: Node[], edges: Edge[]): Node[] {
  const sortedOrder = topologicalSort(nodes, edges);
  return sortedOrder.map((id) => nodes.find((node) => node.id === id)!).filter(Boolean);
}

function getInitialNodeIds(nodes: Node[], edges: Edge[]): string[] {
  return nodes
    .filter((node) => !edges.some((edge) => edge.target === node.id))
    .map((node) => node.id);
}

type ExecutedNodeOutputs = Map<string, ConvertValuesToObject<Value<string, ValueTypes>>>;

function getSubFlow(
  loopNode: Node,
  allNodes: Node[],
  edges: Edge[]
): {
  subFlowNodes: Node[];
  subFlowEdges: Edge[];
  resumeNode: Node | null;
} {
  const subFlowNodes: Node[] = [loopNode];
  const visited = new Set<string>();

  let resumeNode: Node | null = null;

  function dfs(current: Node) {
    visited.add(current.id);

    const childEdges = edges.filter((e) => e.source === current.id);

    for (const edge of childEdges) {
      const child = allNodes.find((n) => n.id === edge.target);

      if (!child) continue;

      if (child.isLoop) {
        if (!visited.has(child.id)) {
          subFlowNodes.push(child);
          dfs(child);
        }
      } else {
        resumeNode = child;
      }
    }
  }

  dfs(loopNode);

  const subFlowEdges = edges.filter(
    (edge) =>
      subFlowNodes.some((node) => node.id === edge.source) &&
      subFlowNodes.some((node) => node.id === edge.target)
  );

  return { subFlowNodes, subFlowEdges, resumeNode };
}

function mapNodeOuputsToInput(
  edges: Edge[],
  node: Node,
  executedNodes: ExecutedNodeOutputs,
  iteration?: number
) {
  const inputEdges = edges.filter((edge) => edge.target === node.id);

  return inputEdges.reduce(
    (acc, current) => {
      let sourceData =
        iteration !== undefined ? executedNodes.get(`${current.source}_${iteration}`) : undefined;

      if (sourceData === undefined) {
        sourceData = executedNodes.get(current.source);

        if (Array.isArray(sourceData)) {
          sourceData = sourceData[0];
        }
      }
      if (!sourceData) {
        throw new Error(`No output found for ${current.source} (iteration: ${iteration})`);
      }
      return {
        ...acc,
        [current.targetValue || '']: sourceData[current.sourceValue || ''],
      };
    },
    {} as ConvertValuesToObject<(typeof node)['inputMap']>
  );
}

async function executeNode<NodeType extends UnknowEnum>(
  node: Node<NodeType>,
  edges: Edge[],
  executors: Executor<NodeType>[],
  sortedNodes: Node[],
  executedNodeOutputs: ExecutedNodeOutputs,
  initialNodeIds: string[],
  iteration?: number
): Promise<any> {
  const executor = executors.find((e) => e.type === node.type);
  if (!executor) throw new Error(`No executor found for ${node.type}`);

  if (executor.isLoopExecutor) {
    const input = mapNodeOuputsToInput(edges, node, executedNodeOutputs, iteration);
    const loopResult = await executor.getArray(input, node.data, iteration);

    if (!Array.isArray(loopResult)) {
      throw new Error('Loop node executor must return an array');
    }

    log('loopResult', loopResult);
    executedNodeOutputs.set(node.id, loopResult as any);

    const { subFlowNodes, subFlowEdges, resumeNode } = getSubFlow(node, sortedNodes, edges);

    for (let i = 0; i < loopResult.length; i++) {
      log('currentLoop', loopResult[i]);

      executedNodeOutputs.set(`${node.id}_${i}`, loopResult[i] as any);

      if (subFlowNodes.length > 1) {
        await executeNode(
          subFlowNodes[1],
          subFlowEdges,
          executors,
          subFlowNodes,
          executedNodeOutputs,
          initialNodeIds,
          i
        );
      }
    }

    if (resumeNode) {
      await executeNode(
        resumeNode,
        edges,
        executors,
        sortedNodes,
        executedNodeOutputs,
        initialNodeIds
      );
    }
    return loopResult;
  } else {
    let iterationCount: number | undefined;

    const inputEdges = edges.filter((edge) => edge.target === node.id);

    for (const edge of inputEdges) {
      const sourceOutput = executedNodeOutputs.get(edge.source);
      if (Array.isArray(sourceOutput)) {
        iterationCount = sourceOutput.length;
        break;
      }
    }

    if (iterationCount !== undefined && iteration === undefined) {
      const aggregatedOutputs = [];

      for (let i = 0; i < iterationCount; i++) {
        const input = mapNodeOuputsToInput(edges, node, executedNodeOutputs, i);
        const output = await executor.execute(input, node.data, i);

        aggregatedOutputs.push(output);
        executedNodeOutputs.set(`${node.id}_${i}`, output);
      }

      executedNodeOutputs.set(node.id, aggregatedOutputs as any);

      const nextNode = getNextNode(node, sortedNodes);

      if (nextNode && !initialNodeIds.includes(nextNode.id)) {
        await executeNode(
          nextNode,
          edges,
          executors,
          sortedNodes,
          executedNodeOutputs,
          initialNodeIds
        );
      }

      return aggregatedOutputs;
    } else {
      const input = mapNodeOuputsToInput(edges, node, executedNodeOutputs, iteration);
      const output = await executor.execute(input, node.data, iteration);

      if (iteration !== undefined) {
        executedNodeOutputs.set(`${node.id}_${iteration}`, output);
      } else {
        executedNodeOutputs.set(node.id, output);
      }

      log('output', output);
      const nextNode = getNextNode(node, sortedNodes);

      if (nextNode && !initialNodeIds.includes(nextNode.id)) {
        await executeNode(
          nextNode,
          edges,
          executors,
          sortedNodes,
          executedNodeOutputs,
          initialNodeIds
        );
      }

      return output;
    }
  }
}
function getNextNode(currentNode: Node, sortedNodes: Node[]): Node | undefined {
  const currentIndex = sortedNodes.indexOf(currentNode);
  return sortedNodes[currentIndex + 1];
}

async function executeFlow<NodeType extends UnknowEnum>({
  executors,
  nodes,
  edges,
  executedNodeOutputs,
}: Flow<NodeType, ConvertValuesToObject<Value<string, ValueTypes>>> &
  FlowHandlerOptions<NodeType> & {
    executedNodeOutputs: ExecutedNodeOutputs;
  }) {
  const sortedNodes = getSortedNodes(nodes, edges);
  const initialNodeIds = getInitialNodeIds(sortedNodes, edges);

  for (const nodeId of initialNodeIds) {
    const node = nodes.find((n) => n.id === nodeId)!;
    await executeNode(node, edges, executors, sortedNodes, executedNodeOutputs, initialNodeIds);
  }
}

export function getFlowHandler<NodeType extends UnknowEnum>({
  executors,
}: FlowHandlerOptions<NodeType>) {
  const executedNodeOutputs: ExecutedNodeOutputs = new Map();

  async function execute<
    InitialData extends Value<string, ValueTypes> = Value<string, ValueTypes>,
  >({ nodes, edges }: Flow<NodeType, ConvertValuesToObject<InitialData>>) {
    log('nodes', nodes);
    log('edges', edges);
    await executeFlow({ executors, nodes, edges, executedNodeOutputs });
  }

  return { execute };
}
