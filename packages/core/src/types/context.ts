import { ExecutedNodeOutputs, UnknowEnum } from './core';
import { BranchEdge, Edge } from './edge';
import { Executor } from './executor';
import { Node } from './node';

export type IterationContext = number[];

export interface ExecutionContextCache<NodeType extends UnknowEnum> {
  sortedNodes: Node<NodeType>[];
  executorByType: Map<NodeType, Executor<NodeType>>;
  inputEdgesMap: Map<string, Edge[]>;
  nodeIndexMap: Map<string, number>;
  outputEdgesMap: Map<string, Edge[]>;
  branchEdgesMap: Map<string, BranchEdge[]>;
}

export interface ExecutionContext<NodeType extends UnknowEnum>
  extends ExecutionContextCache<NodeType> {
  node: Node<NodeType>;
  edges: Edge[];
  executors: Executor<NodeType>[];
  executedNodeOutputs: ExecutedNodeOutputs;
  initialNodeIds: string[];
  iterationContext?: IterationContext;
}
