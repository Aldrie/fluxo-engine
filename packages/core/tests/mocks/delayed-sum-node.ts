import { WaitExecutor } from '../../src';
import { NodeType } from './enums/node-type';

export interface DelayedSumNode {
  type: NodeType.DELAYED_SUM;
  input: {
    num0: number;
    num1: number;
  };
  data: {
    delay: boolean;
  };
}

export class DelayedSumExecutor extends WaitExecutor<NodeType> {
  type = NodeType.DELAYED_SUM;

  async execute(
    input: DelayedSumNode['input'],
    data?: DelayedSumNode['data']
  ): Promise<{ result: number }> {
    if (data?.delay) this.stopExecution();
    return { result: input.num0 + input.num1 };
  }
}
