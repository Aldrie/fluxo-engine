import { executeNode, getInitialNodeIds, getSortedNodes } from './node';
import { Edge } from './types/edge';
import { Node } from './types/node';
import { ValueTypes } from './types/enums/ValueTypes';
import { Flow, FlowHandlerOptions } from './types/flow';
import { ConvertValuesToObject, Value } from './types/value';
import getLogger from './logger';

const log = getLogger('Flow');

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

export async function executeFlow<NodeType extends UnknowEnum>({
  executors,
  nodes,
  edges,
  executedNodeOutputs,
}: Flow<NodeType, ConvertValuesToObject<Value<string, ValueTypes>>> &
  FlowHandlerOptions<NodeType> & {
    executedNodeOutputs: ExecutedNodeOutputs;
  }) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const sortedNodes = getSortedNodes(nodes, edges);
  log('sortedNodes', sortedNodes);
  const initialNodeIds = getInitialNodeIds(sortedNodes, edges);

  for (const nodeId of initialNodeIds) {
    const node = nodeMap.get(nodeId)!;
    await executeNode(node, edges, executors, sortedNodes, executedNodeOutputs, initialNodeIds);
  }
}
