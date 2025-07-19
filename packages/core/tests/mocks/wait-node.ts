import { WaitExecutor } from '../../src';
import { NodeType } from './enums/node-type';

export interface WaitForeverNodeResumeData {
  output?: any;
  resolveExecution?: boolean;
}

export class WaitForeverExecutor extends WaitExecutor<NodeType> {
  type: NodeType = NodeType.WAIT_FOREVER;

  async execute(_input: any, _data: any, resumeData: WaitForeverNodeResumeData) {
    if (!resumeData?.resolveExecution) this.stopExecution();
    return resumeData?.output || {};
  }
}
