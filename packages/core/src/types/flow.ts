import { ExecutionContextCache } from './context';
import { ExecutedNodeOutputs, UnknowEnum } from './core';
import { Edge } from './edge';
import { Executor } from './executor';
import { Node } from './node';
import { ExecutionSnapshot } from './snapshot';

export interface Flow<NodeType extends UnknowEnum, InitalData = unknown> {
  nodes: Node<NodeType>[];
  edges: Edge[];
  initialData?: InitalData;
  initialNodeIds?: string[];
}

export interface ExecuteFlowOptions<NodeType extends UnknowEnum, InitalData = unknown>
  extends Flow<NodeType, InitalData> {
  executors: Executor<NodeType>[];
  executedNodeOutputs: ExecutedNodeOutputs;
  executionContextCache: ExecutionContextCache<NodeType>;
}

export interface ResumeFlowOptions<NodeTypes = UnknowEnum> {
  nodes: Node<NodeTypes>[];
  edges: Edge[];
  snapshot: ExecutionSnapshot;
  resolved: { nodeId: string; output: any };
}

export interface FlowHandlerOptions<NodeType extends UnknowEnum> {
  executors: Executor<NodeType>[];
  enableLogger?: boolean;
}

export enum FlowExecutionStatus {
  COMPLETED = 0,
  WAITING = 1,
}

export type FlowExecutionResult =
  | { status: FlowExecutionStatus.WAITING; snapshot: ExecutionSnapshot }
  | {
      status: FlowExecutionStatus.COMPLETED;
      snapshot: null;
    };
