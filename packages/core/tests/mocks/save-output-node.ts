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
  };
}

export class SaveOutputExecutor implements NodeExecutor<NodeType> {
  type = NodeType.SAVE_OUTPUT;

  private readonly outputService: OutputServiceMock;

  constructor(outputService: OutputServiceMock) {
    this.outputService = outputService;
  }

  async execute(input: SaveOutputNode['input'], data: SaveOutputNode['data']) {
    this.outputService.registerOutput(data.key, input.value || data.defaultValue);
    return {};
  }
}
