import { WaitExecutor } from '../../src';
import { NodeType } from './enums/node-type';

export interface DelayedSumNode {
  type: NodeType.DELAYED_SUM;
  input: {
    num0: number;
    num1: number;
  };
}

export interface DelayedSumNodeResumeData {
  resolveExecution?: boolean;
}

export class DelayedSumExecutor extends WaitExecutor<NodeType> {
  type = NodeType.DELAYED_SUM;

  async execute(
    input: DelayedSumNode['input'],
    data: any,
    resumeData: DelayedSumNodeResumeData
  ): Promise<{ result: number }> {
    if (!resumeData?.resolveExecution) this.stopExecution();
    return { result: input.num0 + input.num1 };
  }
}
