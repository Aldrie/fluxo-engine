import { NodeExecutor } from '../../src';
import { NodeType } from './enums/node-type';

export interface ValueNode {
  type: NodeType.SUM;
  data: {
    value: any;
  },
  output: {
    value: any;
  }
}

export class ValueExecutor implements NodeExecutor<NodeType> {
  type = NodeType.VALUE;

  async execute(_input: any, data: ValueNode['data']) {
    return data;
  }
}
