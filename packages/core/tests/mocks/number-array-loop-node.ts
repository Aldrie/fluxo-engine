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
    _input: any,
    data: NumberArrayLoopNode['data']
  ): Promise<NumberArrayLoopNode['output'][]> {
    const result = data.array.map((array) =>
      array.reduce(
        (acc, curr, index) => ({
          ...acc,
          [`num${index}`]: curr,
        }),
        {}
      )
    );

    return result;
  }
}
