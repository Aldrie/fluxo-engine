import { ExecutorBehavior, LoopNodeExecutor } from '../../src';
import { NodeType } from './enums/node-type';

export interface NumberArrayLoopNode {
  type: NodeType.NUMBER_ARRAY_LOOP;
  data: {
    array: number[][];
  };
  output: {
    [key: string]: number;
  };
}

export class NumberArrayLoopExecutor implements LoopNodeExecutor<NodeType> {
  type = NodeType.NUMBER_ARRAY_LOOP;
  behavior = ExecutorBehavior.LOOP as const;

  async getArray(
    input: any,
    data: NumberArrayLoopNode['data'] = {} as any
  ): Promise<NumberArrayLoopNode['output'][]> {
    const source: any[] = data.array ?? input.num0 ?? [];

    const result = source.map((item: any) => {
      if (Array.isArray(item)) {
        return item.reduce((acc, curr, index) => ({ ...acc, [`num${index}`]: curr }), {});
      }

      return { num0: item };
    });

    return result;
  }
}
