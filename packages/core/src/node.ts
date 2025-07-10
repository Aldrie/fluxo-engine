import { isBranchEdge } from './edge';
import { getSubFlow } from './flow';
import getLogger from './logger';
import { FluxoWaitSignal } from './wait-signal';

import { IterationContext } from './types/context';
import { ExecutedNodeOutputs, UnknowEnum } from './types/core';
import { BranchEdge, Edge } from './types/edge';
import { ExecutorBehavior } from './types/enums/ExecutorBehavior';
import { Node } from './types/node';

import {
  BranchExecutor,
  Executor,
  LoopNodeExecutor,
  NodeExecutor,
  WaitExecutor,
} from './types/executor';

import { getOutputKey, isLoopNode } from './utils/node';
import { isObjectEmpty } from './utils/object';
import { mapToObject } from './utils/map';
import { ExecutionSnapshot } from './types/snapshot';

const log = getLogger('Node');

function createNodeMap(nodes: Node[]): Map<string, Node> {
  return new Map(nodes.map((n) => [n.id, n]));
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
    let index: number;
    if (iteration !== undefined && iteration < aggregatedOutput.length) {
      index = iteration;
    } else {
      index = aggregatedOutput.length - 1;
    }
    return aggregatedOutput[index]?.[sourceValue || ''] ?? null;
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

    const effectiveIteration = Array.isArray(aggregatedOutput)
      ? iteration !== undefined
        ? iteration
        : aggregatedOutput.length - 1
      : undefined;

    const value = getOutputForEdge(aggregatedOutput, edge.sourceValue, effectiveIteration);
    log(`Effective iteration for edge from ${edge.source}: ${effectiveIteration}`);

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
  currentExecutor: NodeExecutor<NodeType>,
  executors: Executor<NodeType>[],
  sortedNodes: Node[],
  executedNodeOutputs: ExecutedNodeOutputs,
  initialNodeIds: string[],
  iterationContext: IterationContext = []
): Promise<any> {
  const iteration = iterationContext[iterationContext.length - 1];

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
      const output = await currentExecutor?.execute(input, node.data);
      aggregatedOutputs.push(output);
      executedNodeOutputs.set(`${node.id}_${i}`, output);
    }

    executedNodeOutputs.set(node.id, aggregatedOutputs as any);

    const nextNode = getNextNode(node, sortedNodes, executors, executedNodeOutputs, iteration);
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

    const nextNode = getNextNode(node, sortedNodes, executors, executedNodeOutputs, iteration);
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

export async function executeLoopNode<NodeType extends UnknowEnum>(
  node: Node<NodeType>,
  edges: Edge[],
  currentExecutor: LoopNodeExecutor<NodeType>,
  executors: Executor<NodeType>[],
  sortedNodes: Node[],
  executedNodeOutputs: ExecutedNodeOutputs,
  initialNodeIds: string[],
  iterationContext: IterationContext = []
) {
  const iteration = iterationContext[iterationContext.length - 1];

  const input = mapNodeOuputsToInput(edges, node, executedNodeOutputs, iteration);
  const loopResult = await currentExecutor.getArray(input, node.data, iteration);
  log('loopResult:', loopResult);

  if (!Array.isArray(loopResult)) {
    throw new Error('Loop node executor must return an array');
  }

  executedNodeOutputs.set(node.id, loopResult as any);

  const { subFlowNodes, resumeNodes } = getSubFlow(node, sortedNodes, edges);
  log('subFlowNodes', subFlowNodes);

  for (let i = 0; i < loopResult.length; i++) {
    const newContext = [...iterationContext, i];

    log('starting iteration:', newContext, 'with value:', loopResult[i]);

    executedNodeOutputs.set(`${node.id}_${newContext.join('_')}`, loopResult[i]);

    for (const childNode of subFlowNodes.filter((n) => n.id !== node.id)) {
      log('executing child node', childNode.id, 'with context', newContext);

      await executeNode(
        childNode,
        edges,
        executors,
        sortedNodes,
        executedNodeOutputs,
        initialNodeIds,
        newContext
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
        initialNodeIds,
        iterationContext
      );
    }
  }

  return loopResult;
}

export async function executeBranchNode<NodeType extends UnknowEnum>(
  node: Node<NodeType>,
  edges: Edge[],
  currentExecutor: BranchExecutor<NodeType>,
  executors: Executor<NodeType>[],
  sortedNodes: Node[],
  executedNodeOutputs: ExecutedNodeOutputs,
  initialNodeIds: string[],
  iterationContext: IterationContext = []
) {
  const iteration = iterationContext[iterationContext.length - 1];
  const input = mapNodeOuputsToInput(edges, node, executedNodeOutputs, iteration);

  const branchDecision = await (currentExecutor as BranchExecutor<NodeType>).executeBranch(
    input,
    node.data
  );

  const decisionKey = branchDecision ? currentExecutor.getTrueKey() : currentExecutor.getFalseKey();

  const nextEdge = edges.find((edge) => isBranchEdge(edge) && edge.branch === decisionKey);

  if (!nextEdge) {
    throw new Error(`No outgoing edge found for branch decision: ${decisionKey}`);
  }

  const nextNode = sortedNodes.find((n) => n.id === nextEdge.target);

  if (!nextNode) {
    throw new Error(`No node found for id ${nextEdge.target}`);
  }

  executedNodeOutputs.set(node.id, { result: branchDecision, executedBranch: true });
  log(
    `Branch node "${node.id}" executed in iteration ${iteration} with decision: ${branchDecision}`
  );

  const branchEdges = edges.filter(
    (edge) => edge.source === node.id && isBranchEdge(edge)
  ) as BranchEdge[];

  for (const edge of branchEdges) {
    if (edge.branch !== decisionKey) {
      log(
        `Marking node "${edge.target}" as skipped for branch (branch: ${edge.branch}) in iteration ${iteration}`
      );

      if (iteration !== undefined) {
        executedNodeOutputs.set(`${edge.target}_${iteration}`, { skipped: true });
      } else {
        executedNodeOutputs.set(edge.target, { skipped: true });
      }
    }
  }

  log(`Executing next node in branch: ${nextNode.id} (iteration: ${iteration})`);

  await executeNode(
    nextNode,
    edges,
    executors,
    sortedNodes,
    executedNodeOutputs,
    initialNodeIds,
    iterationContext
  );

  if (iteration !== undefined) {
    const { subFlowNodes } = getSubFlow(node, sortedNodes, edges);

    for (const subNode of subFlowNodes) {
      executedNodeOutputs.set(`${subNode.id}_${iteration}`, { branchHandled: true });
      log(`Marking subflow node "${subNode.id}" as branchHandled for iteration ${iteration}`);
    }

    executedNodeOutputs.set(`branchCompleted_${node.id}_${iteration}`, { completed: true });
    log(`Marked branch "${node.id}" as completed for iteration ${iteration}`);
  }

  return branchDecision;
}

async function executeWaitNode<NodeType extends UnknowEnum>(
  node: Node<NodeType>,
  edges: Edge[],
  executor: WaitExecutor<NodeType>,
  executedNodeOutputs: ExecutedNodeOutputs,
  executors: Executor<NodeType>[],
  sortedNodes: Node[],
  initialNodeIds: string[],
  iterationContext: IterationContext = [],
  key: string
): Promise<any> {
  try {
    const input = mapNodeOuputsToInput(edges, node, executedNodeOutputs, iterationContext.at(-1));

    const output = await executor.execute(input, node.data);

    executedNodeOutputs.set(key, output);

    const next = getNextNode(
      node,
      sortedNodes,
      executors,
      executedNodeOutputs,
      iterationContext.at(-1)
    );
    if (next && !initialNodeIds.includes(next.id)) {
      await executeNode(
        next,
        edges,
        executors,
        sortedNodes,
        executedNodeOutputs,
        initialNodeIds,
        iterationContext
      );
    }

    return output;
  } catch (e) {
    if (e instanceof FluxoWaitSignal) {
      const snapshot: ExecutionSnapshot = {
        executedNodeOutputs: mapToObject(executedNodeOutputs),
        pending: [{ nodeId: node.id, iteration: [...iterationContext] }],
      };
      throw new FluxoWaitSignal(snapshot);
    }

    throw e;
  }
}

export async function executeNode<NodeType extends UnknowEnum>(
  node: Node<NodeType>,
  edges: Edge[],
  executors: Executor<NodeType>[],
  sortedNodes: Node[],
  executedNodeOutputs: ExecutedNodeOutputs,
  initialNodeIds: string[],
  iterationContext: IterationContext = []
): Promise<any> {
  const key = getOutputKey(node, iterationContext);
  const existing = executedNodeOutputs.get(key);

  if (existing !== undefined) {
    log(`Skipping node ${node.id} for iteration ${iterationContext} as it was already executed`);
    return existing;
  }

  log('executing node', node.id, 'with context', iterationContext);
  const executor = executors.find((e) => e.type === node.type);

  if (!executor) throw new Error(`No executor found for ${node.type}`);

  if (executor.behavior === ExecutorBehavior.WAIT) {
    return executeWaitNode(
      node,
      edges,
      executor as WaitExecutor<NodeType>,
      executedNodeOutputs,
      executors,
      sortedNodes,
      initialNodeIds,
      iterationContext,
      key
    );
  }

  if (executor?.behavior === ExecutorBehavior.BRANCH) {
    return executeBranchNode(
      node,
      edges,
      executor,
      executors,
      sortedNodes,
      executedNodeOutputs,
      initialNodeIds,
      iterationContext
    );
  }

  if (executor?.behavior === ExecutorBehavior.LOOP) {
    return executeLoopNode(
      node,
      edges,
      executor,
      executors,
      sortedNodes,
      executedNodeOutputs,
      initialNodeIds,
      iterationContext
    );
  }

  return executeNonLoopNode(
    node,
    edges,
    executor,
    executors,
    sortedNodes,
    executedNodeOutputs,
    initialNodeIds,
    iterationContext
  );
}

export function getNextNode(
  currentNode: Node,
  sortedNodes: Node[],
  executors: Executor<UnknowEnum>[],
  executedNodeOutputs: ExecutedNodeOutputs,
  iteration?: number
): Node | undefined {
  const currentKey = iteration !== undefined ? `${currentNode.id}_${iteration}` : currentNode.id;

  if (
    iteration !== undefined &&
    executedNodeOutputs.get(`branchCompleted_${currentKey}`)?.completed
  ) {
    log(
      `getNextNode: branch already completed for node "${currentNode.id}" in iteration ${iteration}`
    );

    return undefined;
  }

  if (
    iteration !== undefined &&
    executedNodeOutputs.get(`${currentNode.id}_${iteration}`)?.branchHandled
  ) {
    log(
      `getNextNode: node "${currentNode.id}" already handled (branchHandled) in iteration ${iteration}`
    );

    return undefined;
  }

  const currentExecutor = executors.find((e) => e.type === currentNode.type);
  const currentOutput = executedNodeOutputs.get(currentNode.id);

  if (
    (currentExecutor &&
      (currentExecutor.behavior === ExecutorBehavior.BRANCH ||
        currentExecutor.behavior === ExecutorBehavior.LOOP)) ||
    (currentOutput && (currentOutput as any)?.executedBranch === true)
  ) {
    log(`getNextNode: current node "${currentNode.id}" is branch/loop or marked executedBranch`);
    return undefined;
  }

  const currentIndex = sortedNodes.indexOf(currentNode);
  for (let i = currentIndex + 1; i < sortedNodes.length; i++) {
    const next = sortedNodes[i];
    const output = executedNodeOutputs.get(next.id);

    if (output !== undefined && (output as any).skipped === true) {
      log(`getNextNode: node "${next.id}" is marked as skipped, ignoring.`);
      continue;
    }

    if (
      iteration !== undefined &&
      executedNodeOutputs.get(`${next.id}_${iteration}`)?.branchHandled
    ) {
      log(`getNextNode: node "${next.id}" is branchHandled for iteration ${iteration}, ignoring.`);
      continue;
    }

    if (output === undefined) {
      log(`getNextNode: next candidate node found: "${next.id}"`);
      return next;
    }
  }

  log(`getNextNode: no next candidate found after "${currentNode.id}"`);
  return undefined;
}
