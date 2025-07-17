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
import { ExecutionSnapshot, PendingWait } from './types/snapshot';
import { FlowExecutionStatus } from './types/flow';

const log = getLogger('Node');

export interface ExecutionContext<NodeType extends UnknowEnum> {
  node: Node<NodeType>;
  edges: Edge[];
  executors: Executor<NodeType>[];
  sortedNodes: Node<NodeType>[];
  executedNodeOutputs: ExecutedNodeOutputs;
  initialNodeIds: string[];
  iterationContext?: IterationContext;
}

interface NonLoopOptions<NodeType extends UnknowEnum> extends ExecutionContext<NodeType> {
  currentExecutor: NodeExecutor<NodeType>;
}

interface LoopOptions<NodeType extends UnknowEnum> extends ExecutionContext<NodeType> {
  currentExecutor: LoopNodeExecutor<NodeType>;
}

interface BranchOptions<NodeType extends UnknowEnum> extends ExecutionContext<NodeType> {
  currentExecutor: BranchExecutor<NodeType>;
}

interface WaitOptions<NodeType extends UnknowEnum> extends ExecutionContext<NodeType> {
  executor: WaitExecutor<NodeType>;
  key: string;
}

function createNodeMap(nodes: Node[]): Map<string, Node> {
  return new Map(nodes.map((n) => [n.id, n]));
}

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

function getOutputForEdge(
  aggregatedOutput: any,
  sourceValue: string | undefined,
  iteration?: number
) {
  if (Array.isArray(aggregatedOutput)) {
    const index =
      iteration !== undefined && iteration < aggregatedOutput.length
        ? iteration
        : aggregatedOutput.length - 1;
    return aggregatedOutput[index]?.[sourceValue || ''] ?? null;
  }

  return aggregatedOutput?.[sourceValue || ''];
}

function mapNodeOutputsToInput(
  edges: Edge[],
  node: Node,
  executedNodes: ExecutedNodeOutputs,
  iteration?: number
) {
  const inputEdges = edges.filter((e) => e.target === node.id && !isBranchEdge(e));
  const input = {} as typeof node.input;

  for (const edge of inputEdges) {
    const agg = executedNodes.get(edge.source);
    const effectiveIteration = Array.isArray(agg) ? (iteration ?? agg.length - 1) : undefined;
    const value = getOutputForEdge(agg, edge.sourceValue, effectiveIteration);
    if (value === undefined) {
      throw new Error(`No output for ${edge.source} (iter=${iteration}) key="${edge.sourceValue}"`);
    }
    input[edge.targetValue || ''] = value;
  }

  return isObjectEmpty(input) ? node.defaultInput || {} : input;
}

function isSkipped(out: any) {
  return !!out && typeof out === 'object' && out.skipped === true;
}

export async function executeNonLoopNode<NodeType extends UnknowEnum>(
  opts: NonLoopOptions<NodeType>
): Promise<any> {
  const {
    node,
    edges,
    currentExecutor,
    executedNodeOutputs,
    initialNodeIds,
    iterationContext = [],
  } = opts;

  const iter = iterationContext.at(-1);

  let iterationCount: number | undefined;

  for (const e of edges.filter((e) => e.target === node.id)) {
    const out = executedNodeOutputs.get(e.source);
    if (Array.isArray(out)) {
      iterationCount = out.length;
      break;
    }
  }

  if (iterationCount !== undefined && iter === undefined) {
    const agg: any[] = [];

    for (let i = 0; i < iterationCount; i++) {
      const input = mapNodeOutputsToInput(edges, node, executedNodeOutputs, i);
      const out = await currentExecutor.execute(input, node.data);

      agg.push(out);

      executedNodeOutputs.set(getOutputKey(node, [...iterationContext, i]), out);
    }

    executedNodeOutputs.set(node.id, agg as any);

    const next = getNextNode({ ...opts, node, iterationContext });

    if (next && !initialNodeIds.includes(next.id)) {
      await executeNode({ ...opts, node: next });
    }

    return agg;
  }

  const input = mapNodeOutputsToInput(edges, node, executedNodeOutputs, iter);
  const output = await currentExecutor.execute(input, node.data);

  if (iter !== undefined) {
    executedNodeOutputs.set(getOutputKey(node, iterationContext), output);

    const arr = Array.isArray(executedNodeOutputs.get(node.id))
      ? [...(executedNodeOutputs.get(node.id) as unknown as any[])]
      : [];

    arr.push(output);
    executedNodeOutputs.set(node.id, arr as any);
  } else {
    executedNodeOutputs.set(node.id, output);
  }

  const next = getNextNode({ ...opts, node, iterationContext });

  if (iter === undefined && next && !initialNodeIds.includes(next.id)) {
    await executeNode({ ...opts, node: next });
  }

  return output;
}

export async function executeLoopNode<NodeType extends UnknowEnum>(
  opts: LoopOptions<NodeType>
): Promise<any> {
  const {
    node,
    edges,
    currentExecutor,
    sortedNodes,
    executedNodeOutputs,
    iterationContext = [],
    executors,
    initialNodeIds,
  } = opts;

  const prefix = `[LOOP ${node.id}]`;
  const ctxKey = getOutputKey(node, iterationContext);
  const doneKey = `${ctxKey}_loopCompleted`;

  const iterKey = (i: number) => `${ctxKey}_${i}`;

  const iterDoneKey = (i: number) => `${ctxKey}_${i}_done`;
  const iterDone = (i: number) => executedNodeOutputs.has(iterDoneKey(i));

  if (executedNodeOutputs.has(doneKey)) {
    log(`${prefix} already completed`);

    const next = getNextNode({ ...opts, node, iterationContext });

    if (next) await executeNode({ ...opts, node: next, iterationContext });

    return executedNodeOutputs.get(node.id);
  }

  const input = mapNodeOutputsToInput(edges, node, executedNodeOutputs, iterationContext.at(-1));
  const arr = await currentExecutor.getArray(input, node.data, iterationContext.at(-1));
  if (!Array.isArray(arr)) throw new Error('Loop must return an array');

  executedNodeOutputs.set(node.id, arr as any);
  log(`${prefix} array len ${arr.length}`);

  const { subFlowNodes } = getSubFlow({
    loopNode: node,
    sortedNodes,
    edges,
    executors,
  });

  const bodyIds = new Set(subFlowNodes.map((n) => n.id));
  bodyIds.delete(node.id);

  const childExecNodes = sortedNodes.filter((n) => bodyIds.has(n.id));

  log(
    `${prefix} body nodes:`,
    childExecNodes.map((n) => n.id)
  );

  for (let i = 0; i < arr.length; i++) {
    if (iterDone(i)) {
      log(`${prefix} iter ${i} already done, skipping`);
      continue;
    }

    const ctx = [...iterationContext, i];

    executedNodeOutputs.set(iterKey(i), arr[i]);
    log(`${prefix} iter ${i} start`);

    for (const child of childExecNodes) {
      const res = await executeNode({
        node: child,
        edges,
        executors,
        sortedNodes,
        executedNodeOutputs,
        initialNodeIds,
        iterationContext: ctx,
      });

      if (res?.status === FlowExecutionStatus.WAITING) {
        return res;
      }
    }

    log(`${prefix} iter ${i} done`);

    executedNodeOutputs.set(iterDoneKey(i), true as any);
  }

  executedNodeOutputs.set(doneKey, true as any);
  log(`${prefix} all iterations done — exiting loop`);

  return arr;
}
export async function executeBranchNode<NodeType extends UnknowEnum>(
  opts: BranchOptions<NodeType>
) {
  const {
    node,
    edges,
    currentExecutor,
    sortedNodes,
    executedNodeOutputs,
    iterationContext = [],
  } = opts;

  const iter = iterationContext.at(-1);

  const input = mapNodeOutputsToInput(edges, node, executedNodeOutputs, iter);

  let decision: boolean;

  if (typeof (input as any).num0 === 'string') {
    const trueEdge = edges.find(
      (e) => isBranchEdge(e) && e.source === node.id && e.branch === currentExecutor.getTrueKey()
    );

    if (!trueEdge) {
      throw new Error(`No true-branch edge found for node "${node.id}"`);
    }

    const trueNode = sortedNodes.find((n) => n.id === trueEdge.target)!;
    const trueDefault = (trueNode.data as any).defaultValue;

    decision = (input as any).num0 === trueDefault;
  } else {
    decision = await currentExecutor.executeBranch(input, node.data);
  }

  const branchKey = decision ? currentExecutor.getTrueKey() : currentExecutor.getFalseKey();

  const nextEdge = edges.find(
    (e) => isBranchEdge(e) && e.source === node.id && e.branch === branchKey
  );

  const outputKey = getOutputKey(node, iterationContext);

  if (!nextEdge) {
    executedNodeOutputs.set(outputKey, { result: decision, executedBranch: true });

    for (const be of edges.filter((e) => e.source === node.id && isBranchEdge(e)) as BranchEdge[]) {
      const skipKey = iter !== undefined ? `${be.target}_${iter}` : be.target;
      executedNodeOutputs.set(skipKey, { skipped: true });
    }

    return decision;
  }

  const nextNode = sortedNodes.find((n) => n.id === nextEdge.target)!;
  const branchOutput = { result: decision, executedBranch: true };

  if (iter !== undefined) {
    executedNodeOutputs.set(`${node.id}_${iter}`, branchOutput);
  } else {
    executedNodeOutputs.set(node.id, branchOutput);
  }

  for (const be of edges.filter((e) => e.source === node.id && isBranchEdge(e)) as BranchEdge[]) {
    if (be.branch !== branchKey) {
      const key = iter !== undefined ? `${be.target}_${iter}` : be.target;
      executedNodeOutputs.set(key, { skipped: true });
    }
  }

  await executeNode({ ...opts, node: nextNode });
  return decision;
}

export async function executeWaitNode<NodeType extends UnknowEnum>(
  opts: WaitOptions<NodeType>
): Promise<any> {
  const {
    node,
    edges,
    executor,
    executedNodeOutputs,
    initialNodeIds,
    iterationContext = [],
    key,
  } = opts;

  try {
    const input = mapNodeOutputsToInput(edges, node, executedNodeOutputs, iterationContext.at(-1));
    const output = await executor.execute(input, node.data);

    executedNodeOutputs.set(key, output);

    const next = getNextNode(opts);

    if (next && !initialNodeIds.includes(next.id)) {
      await executeNode({ ...opts, node: next });
    }

    return output;
  } catch (e) {
    if (e instanceof FluxoWaitSignal) {
      const snapshot: ExecutionSnapshot = {
        executedNodeOutputs: mapToObject(executedNodeOutputs),
        pending: [
          { nodeId: node.id, iteration: [...(opts.iterationContext || [])] },
        ] as PendingWait[],
      };

      log('[DEBUG WAIT] gerando snapshot de pausa:', JSON.stringify(snapshot, null, 2));
      throw new FluxoWaitSignal(snapshot);
    }
    throw e;
  }
}

export async function executeNode<NodeType extends UnknowEnum>(
  context: ExecutionContext<NodeType>
): Promise<any> {
  const { node, executors, executedNodeOutputs, iterationContext = [] } = context;

  const executor = executors.find((e) => e.type === node.type);
  if (!executor) throw new Error(`No executor for ${node.type}`);

  log(`executing ${node.id}`, iterationContext);

  const key = getOutputKey(node, iterationContext);

  if (
    executor.behavior !== ExecutorBehavior.LOOP &&
    (isSkipped(executedNodeOutputs.get(node.id)) || isSkipped(executedNodeOutputs.get(key)))
  ) {
    executedNodeOutputs.set(key, { skipped: true } as any);
    return;
  }

  const hasSkippedDependency = context.edges
    .filter((e) => e.target === node.id)
    .some((e) => {
      const baseOut = executedNodeOutputs.get(e.source);
      const iterKey = iterationContext.length > 0 ? `${e.source}_${iterationContext.at(-1)}` : null;
      const iterOut = iterKey ? executedNodeOutputs.get(iterKey) : undefined;

      return isSkipped(iterOut ?? baseOut);
    });

  if (hasSkippedDependency) {
    executedNodeOutputs.set(key, { skipped: true } as any);
    return;
  }

  if (executedNodeOutputs.has(key)) {
    if (executor.behavior === ExecutorBehavior.LOOP) {
      const completed = executedNodeOutputs.get(`${node.id}_loopCompleted`);

      if (iterationContext.length > 0) {
        log(`Skipping ${key} (loop iteration already done)`);
        return executedNodeOutputs.get(key);
      }

      if (completed) {
        log(`Skipping ${key} (loop completed)`);
        return executedNodeOutputs.get(key);
      }
    } else {
      log(`Skipping ${key}`);
      return executedNodeOutputs.get(key);
    }
  }

  if (executor.behavior === ExecutorBehavior.WAIT) {
    try {
      await executeWaitNode({ ...context, executor: executor as WaitExecutor<NodeType>, key });
    } catch (e) {
      if (e instanceof FluxoWaitSignal) throw e;
      throw e;
    }

    return;
  }

  if (executor.behavior === ExecutorBehavior.BRANCH) {
    return executeBranchNode({
      ...context,
      currentExecutor: executor as BranchExecutor<NodeType>,
    });
  }

  if (executor.behavior === ExecutorBehavior.LOOP) {
    return executeLoopNode({
      ...context,
      currentExecutor: executor as LoopNodeExecutor<NodeType>,
    });
  }

  return executeNonLoopNode({
    ...context,
    currentExecutor: executor as NodeExecutor<NodeType>,
  });
}

export function getNextNode<NodeType extends UnknowEnum>(
  context: ExecutionContext<NodeType>
): Node<NodeType> | undefined {
  const { currentNode, sortedNodes, executors, executedNodeOutputs, iterationContext } = {
    currentNode: context.node,
    ...context,
  };

  const iteration = iterationContext?.at(-1);
  const currentKey = getOutputKey(currentNode, iterationContext);

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
