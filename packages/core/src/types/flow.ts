import { UnknowEnum } from './core';
import { Edge } from './edge';
import { Executor } from './executor';
import { Node } from './node';

export interface Flow<NodeTypes = UnknowEnum, InitalData = unknown> {
  nodes: Node<NodeTypes>[];
  edges: Edge[];
  initialData?: InitalData;
}

export interface FlowHandlerOptions<NodeType extends UnknowEnum> {
  executors: Executor<NodeType>[];
  enableLogger?: boolean;
}
