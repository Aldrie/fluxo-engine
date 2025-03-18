import { NodeExecutor } from '../../src';
import { NodeType } from './enums/node-type';

export interface SumNode {
  type: NodeType.SUM;
  input: {
    num0: number;
    num1: number;
  };
}

export class SumExecutor implements NodeExecutor<NodeType> {
  type = NodeType.SUM;

  async execute(input: SumNode['input']) {
    return { result: input.num0 + input.num1 };
  }
}
