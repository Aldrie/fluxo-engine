import { BranchExecutor, ExecutorBehavior } from '../../src';
import { NodeType } from './enums/node-type';

export interface GreaterThanNode {
  type: NodeType.NUMBER_ARRAY_LOOP;
  input: {
    num0: number;
    num1: number;
  };
}

export class GreaterThanNodeExecutor implements BranchExecutor<NodeType> {
  type = NodeType.GREATER_THAN;
  behavior = ExecutorBehavior.BRANCH as const;

  getTrueKey(): string {
    return 'isGreater';
  }

  getFalseKey(): string {
    return 'isNotGreater';
  }

  async executeBranch(input: GreaterThanNode['input']): Promise<boolean> {
    return input.num0 > input.num1;
  }
}
