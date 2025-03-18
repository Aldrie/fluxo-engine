import { NodeExecutor } from '../../src';
import { NodeType } from './enums/node-type';
import { OutputServiceMock } from './output-service';

export interface SaveOutputNode {
  type: NodeType.SAVE_OUTPUT;
  input: {
    value: any;
  };
  data: {
    key: any;
    defaultValue?: any;
    allowEmptyValue?: boolean;
  };
}

export class SaveOutputExecutor implements NodeExecutor<NodeType> {
  type = NodeType.SAVE_OUTPUT;

  private readonly outputService: OutputServiceMock;

  constructor(outputService: OutputServiceMock) {
    this.outputService = outputService;
  }

  async execute(input: SaveOutputNode['input'], data: SaveOutputNode['data']) {
    const value = input.value || data.defaultValue;

    if (value === undefined || (value === null && !data?.allowEmptyValue)) return {};

    this.outputService.registerOutput(data.key, value);
    return {};
  }
}
