import { ConvertValuesToObject } from './value';

export type SerializedExecuted = Record<string, ConvertValuesToObject<any>>;

export interface PendingWait {
  nodeId: string;
  iteration: number[];
}

export interface ExecutionSnapshot {
  executedNodeOutputs: SerializedExecuted;
  pending: PendingWait[];
}
