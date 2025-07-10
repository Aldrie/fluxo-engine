import { UnknowEnum } from './core';
import { Edge } from './edge';
import { Executor } from './executor';
import { Node } from './node';
import { ExecutionSnapshot } from './snapshot';

export interface Flow<NodeTypes = UnknowEnum, InitalData = unknown> {
  nodes: Node<NodeTypes>[];
  edges: Edge[];
  initialData?: InitalData;
  initialNodeIds?: string[];
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
