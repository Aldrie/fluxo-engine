import { UnknowEnum } from './core';
import { Node } from './node';

interface BaseExecutor<Enum extends UnknowEnum> {
  type: Enum;
}

export interface LoopNodeExecutor<Enum extends UnknowEnum> extends BaseExecutor<Enum> {
  isLoopExecutor: true;
  getArray(input: Node['input'], data: Node['data'], iteration?: number): Promise<Node['output'][]>;
}

export interface NodeExecutor<Enum extends UnknowEnum> extends BaseExecutor<Enum> {
  isLoopExecutor?: false;
  execute(input: Node['input'], data: Node['data']): Promise<Node['output']>;
}

export type Executor<Enum extends UnknowEnum> = LoopNodeExecutor<Enum> | NodeExecutor<Enum>;
