import { BranchExecutor, ExecutorBehavior } from '../../src';
import { NodeType } from './enums/node-type';

export interface ValueIsNode {
  type: NodeType.VALUE_IS;
  input: {
    value: any;
  };
  data: {
    valueToCompare: any;
  };
}

export class ValueIsNodeExecutor implements BranchExecutor<NodeType> {
  type = NodeType.VALUE_IS;
  behavior = ExecutorBehavior.BRANCH as const;

  getTrueKey(): string {
    return 'true';
  }

  getFalseKey(): string {
    return 'false';
  }

  async executeBranch(input: ValueIsNode['input'], data: ValueIsNode['data']): Promise<boolean> {
    return input?.value === data?.valueToCompare;
  }
}
