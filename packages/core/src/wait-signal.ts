import { ExecutionSnapshot } from './types/snapshot';

export class FluxoWaitSignal extends Error {
  constructor(public snapshot?: ExecutionSnapshot) {
    super('FLOW_WAIT');
  }
}
