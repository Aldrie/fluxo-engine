import { FluxoWaitSignalException } from '../exceptions/wait-signal-exception';
import { UnknowEnum } from './core';
import { ExecutorBehavior } from './enums/ExecutorBehavior';
import { Node } from './node';

interface BaseExecutor<Enum extends UnknowEnum> {
  type: Enum;
  behavior?: ExecutorBehavior;
}

export interface LoopNodeExecutor<Enum extends UnknowEnum> extends BaseExecutor<Enum> {
  behavior: ExecutorBehavior.LOOP;
  getArray(input: Node['input'], data: Node['data'], iteration?: number): Promise<Node['output'][]>;
}

export interface NodeExecutor<Enum extends UnknowEnum> extends BaseExecutor<Enum> {
  behavior?: ExecutorBehavior.DEFAULT;
  execute(input: Node['input'], data: Node['data']): Promise<Node['output']>;
}

export interface BranchExecutor<Enum extends UnknowEnum> extends BaseExecutor<Enum> {
  behavior: ExecutorBehavior.BRANCH;
  executeBranch(input: Node['input'], data: Node['data']): Promise<boolean>;
  getTrueKey(): string;
  getFalseKey(): string;
}

export abstract class WaitExecutor<Enum extends UnknowEnum> implements BaseExecutor<Enum> {
  abstract type: Enum;
  behavior = ExecutorBehavior.WAIT as const;

  abstract execute(input: Node['input'], data: Node['data']): Promise<Node['output']>;

  protected stopExecution(): never {
    throw new FluxoWaitSignalException();
  }
}

export type Executor<Enum extends UnknowEnum> =
  | LoopNodeExecutor<Enum>
  | NodeExecutor<Enum>
  | BranchExecutor<Enum>
  | WaitExecutor<Enum>;
