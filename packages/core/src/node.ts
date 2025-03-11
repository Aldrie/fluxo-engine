import { isBranchEdge } from './edge';
import { getSubFlow } from './flow';
import getLogger from './logger';
import { ExecutedNodeOutputs, UnknowEnum } from './types/core';
import { BranchEdge, Edge } from './types/edge';
import { ExecutorBehavior } from './types/enums/ExecutorBehavior';
import { BranchExecutor, Executor, NodeExecutor } from './types/executor';
import { Node } from './types/node';
import { isObjectEmpty } from './utils/object';

const log = getLogger('Node');

function createNodeMap(nodes: Node[]): Map<string, Node> {
  return new Map(nodes.map((n) => [n.id, n]));
}

export function isLoopNode(node: Node, executors: Executor<UnknowEnum>[]) {
  const foundExecutor = executors.find((e) => e.type === node.type);
  return foundExecutor?.behavior === ExecutorBehavior.LOOP;
}

function topologicalSort(
  nodes: Node[],
  edges: Edge[],
  executors: Executor<UnknowEnum>[] = []
): string[] {
  const nodeMap = createNodeMap(nodes);
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

  const queue: string[] = nodes
    .filter((n) => inDegree[n.id] === 0)
    .map((n) => n.id)
    .sort((a, b) => {
      const nodeA = nodeMap.get(a)!;
      const nodeB = nodeMap.get(b)!;
      const nodeAIsLoop = isLoopNode(nodeA, executors);
      const nodeBIsLoop = isLoopNode(nodeB, executors);

      return nodeAIsLoop === nodeBIsLoop ? 0 : nodeAIsLoop ? 1 : -1;
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

    queue.sort((a, b) => {
      const nodeA = nodeMap.get(a)!;
      const nodeB = nodeMap.get(b)!;
      const nodeAIsLoop = isLoopNode(nodeA, executors);
      const nodeBIsLoop = isLoopNode(nodeB, executors);

      return nodeAIsLoop === nodeBIsLoop ? 0 : nodeAIsLoop ? 1 : -1;
    });
  }

  if (sortedOrder.length !== nodes.length) {
    throw new Error('Graph contains cycles!');
  }

  return sortedOrder;
}

export function getSortedNodes(
  nodes: Node[],
  edges: Edge[],
  executors: Executor<UnknowEnum>[]
): Node[] {
  const sortedOrder = topologicalSort(nodes, edges, executors);
  const nodeMap = createNodeMap(nodes);
  return sortedOrder.map((id) => nodeMap.get(id)!).filter(Boolean);
}

export function getInitialNodeIds(nodes: Node[], edges: Edge[]): string[] {
  return nodes
    .filter((node) => !edges.some((edge) => edge.target === node.id))
    .map((node) => node.id);
}

function getOutputForEdge(
  aggregatedOutput: any,
  sourceValue: string | undefined,
  iteration?: number
) {
  if (Array.isArray(aggregatedOutput)) {
    const index = iteration !== undefined ? iteration : 0;
    return aggregatedOutput[index]?.[sourceValue || ''];
  }
  return aggregatedOutput?.[sourceValue || ''];
}

function mapNodeOuputsToInput(
  edges: Edge[],
  node: Node,
  executedNodes: ExecutedNodeOutputs,
  iteration?: number
) {
  const inputEdges = edges.filter((edge) => edge.target === node.id && !isBranchEdge(edge)); 
  const input = {} as (typeof node)['input'];

  for (const edge of inputEdges) {
    const aggregatedOutput = executedNodes.get(edge.source);
    const effectiveIteration = Array.isArray(aggregatedOutput) ? iteration : undefined;
    const value = getOutputForEdge(aggregatedOutput, edge.sourceValue, effectiveIteration);

    log(
      `Mapping for edge from ${edge.source} (key: ${edge.sourceValue}) to ${node.id} (target key: ${edge.targetValue}) with effective iteration ${effectiveIteration}:`,
      value
    );

    if (value === undefined) {
      throw new Error(
        `No output found for ${edge.source} (iteration: ${iteration}) for key "${edge.sourceValue}"`
      );
    }
    input[edge.targetValue || ''] = value;
  }

  return isObjectEmpty(input) ? node?.defaultInput || {} : input;
}

async function executeNonLoopNode<NodeType extends UnknowEnum>(
  node: Node<NodeType>,
  edges: Edge[],
  executors: Executor<NodeType>[],
  sortedNodes: Node[],
  executedNodeOutputs: ExecutedNodeOutputs,
  initialNodeIds: string[],
  iteration?: number
): Promise<any> {
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
      const output = await (executors.find(
        (e) => e.type === node.type
      ) as NodeExecutor<any>)!.execute(input, node.data);
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
    const output = await (executors.find(
      (e) => e.type === node.type
    ) as NodeExecutor<any>)!.execute(input, node.data);

    if (iteration !== undefined) {
      executedNodeOutputs.set(`${node.id}_${iteration}`, output);
      let aggregated = (executedNodeOutputs.get(node.id) || []) as any;
      if (!Array.isArray(aggregated)) aggregated = [];
      aggregated[iteration] = output;
      executedNodeOutputs.set(node.id, aggregated);
    } else {
      executedNodeOutputs.set(node.id, output);
    }

    log('output', output);

    const nextNode = getNextNode(node, sortedNodes);
    if (iteration === undefined && nextNode && !initialNodeIds.includes(nextNode.id)) {
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

export async function executeNode<NodeType extends UnknowEnum>(
  node: Node<NodeType>,
  edges: Edge[],
  executors: Executor<NodeType>[],
  sortedNodes: Node[],
  executedNodeOutputs: ExecutedNodeOutputs,
  initialNodeIds: string[],
  iteration?: number
): Promise<any> {
  log('executing node', node.id, 'iteration', iteration);
  const executor = executors.find((e) => e.type === node.type);
  if (!executor) throw new Error(`No executor found for ${node.type}`);

  if(executor?.behavior === ExecutorBehavior.BRANCH) {
    const input = mapNodeOuputsToInput(edges, node, executedNodeOutputs, iteration);
    const branchDecision = await (executor as BranchExecutor<NodeType>).executeBranch(input, node.data);
    
    const decisionKey = branchDecision ? executor.getTrueKey() : executor.getFalseKey();
    const nextEdge = edges.find(edge => isBranchEdge(edge) && edge.branch === decisionKey);

    if (!nextEdge) {
      throw new Error(`No outgoing edge found for branch decision: ${decisionKey}`);
    }
    
    const nextNode = sortedNodes.find(n => n.id === nextEdge.target);
    
    if (!nextNode) {
      throw new Error(`No node found for id ${nextEdge.target}`);
    }
    
    executedNodeOutputs.set(node.id, { result: branchDecision});
    
    await executeNode(nextNode, edges, executors, sortedNodes, executedNodeOutputs, initialNodeIds);
    return branchDecision;
  } else if (executor?.behavior === ExecutorBehavior.LOOP) {
    const input = mapNodeOuputsToInput(edges, node, executedNodeOutputs, iteration);
    const loopResult = await executor.getArray(input, node.data, iteration);
    log('loopResult:', loopResult);

    if (!Array.isArray(loopResult)) {
      throw new Error('Loop node executor must return an array');
    }

    executedNodeOutputs.set(node.id, loopResult as any);

    const { subFlowNodes, resumeNodes } = getSubFlow(node, sortedNodes, edges);
    log('subFlowNodes', subFlowNodes);

    for (let i = 0; i < loopResult.length; i++) {
      log('starting iteration:', i, 'with value:', loopResult[i]);
      executedNodeOutputs.set(`${node.id}_${i}`, loopResult[i]);

      for (const childNode of subFlowNodes.filter((n) => n.id !== node.id)) {
        log('executing child node', childNode.id, 'at iteration:', i);
        await executeNode(
          childNode,
          edges,
          executors,
          sortedNodes,
          executedNodeOutputs,
          initialNodeIds,
          i
        );
      }
    }

    for (const resumeNode of resumeNodes) {
      if (!executedNodeOutputs.has(resumeNode.id)) {
        await executeNode(
          resumeNode,
          edges,
          executors,
          sortedNodes,
          executedNodeOutputs,
          initialNodeIds
        );
      }
    }

    return loopResult;
  } else {
    return executeNonLoopNode(
      node,
      edges,
      executors,
      sortedNodes,
      executedNodeOutputs,
      initialNodeIds,
      iteration
    );
  }
}

function getNextNode(currentNode: Node, sortedNodes: Node[]): Node | undefined {
  const currentIndex = sortedNodes.indexOf(currentNode);
  return sortedNodes[currentIndex + 1];
}
