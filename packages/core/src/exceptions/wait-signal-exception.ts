import { ExecutionSnapshot } from '../types/snapshot';

export class FluxoWaitSignalException extends Error {
  constructor(public snapshot?: ExecutionSnapshot) {
    super('FLOW_WAIT');
  }
}
