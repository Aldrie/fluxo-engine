import { NodeExecutor } from '../../src';
import { NodeType } from './enums/node-type';

export interface ValueNode {
  type: NodeType.SUM;
  data: {
    value: any;
  };
  output: {
    value: any;
  };
}

export class ValueExecutor implements NodeExecutor<NodeType> {
  type = NodeType.VALUE;

  async execute(input: any, data: ValueNode['data']) {
    const inputObj = input && typeof input === 'object' ? input : {};
    const dataObj = data && typeof data === 'object' ? data : {};
    return { ...dataObj, ...inputObj };
  }
}
