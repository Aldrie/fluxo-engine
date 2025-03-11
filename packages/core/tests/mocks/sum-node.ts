import { ExecutorBehavior } from '../../src';
import { NodeExecutor } from '../../src';
import { NodeType } from './enums/node-type';
import { OutputServiceMock } from './output-service';

export interface SumNode {
  type: NodeType.SUM;
  input: {
    num0: number;
    num1: number;
  },
  data: {
    resultKey: string;
  }
}

export class SumExecutor implements NodeExecutor<NodeType> {
  type = NodeType.SUM;

  private readonly outputService: OutputServiceMock;

  constructor(outputService: OutputServiceMock) {
    this.outputService = outputService;
  }

  async execute(input: SumNode['input'], data: SumNode['data']) {
    const result = input.num0 + input.num1;
    this.outputService.registerOutput(data.resultKey, result);
    return { result };
  }
}
