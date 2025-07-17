import { WaitExecutor } from '../../src';
import { NodeType } from './enums/node-type';

export class WaitForeverExecutor extends WaitExecutor<NodeType> {
  type: NodeType = NodeType.WAIT_FOREVER;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_input: any) {
    this.stopExecution();
    return {};
  }
}
