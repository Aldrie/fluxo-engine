import { ExecutorBehavior, LoopNodeExecutor } from '../../src';
import { NodeType } from './enums/node-type';

export interface ObjectArrayLoopNode {
  type: NodeType.OBJECT_ARRAY_LOOP;
  input: {
    object_array: Record<string, any>[];
  };
}

export class ObjectArrayLoopExecutor implements LoopNodeExecutor<NodeType> {
  type = NodeType.OBJECT_ARRAY_LOOP;
  behavior = ExecutorBehavior.LOOP as const;

  async getArray(input: ObjectArrayLoopNode['input']): Promise<any[]> {
    const result = (input?.object_array || []).map((object) => object);
    return result;
  }
}
