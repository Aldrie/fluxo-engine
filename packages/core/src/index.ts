export * from './flow';
export * from './types/edge';
export * from './types/enums/ValueTypes';
export * from './types/executor';
export * from './types/flow';
export * from './types/node';
export * from './types/value';

import { executeFlow } from './flow';
import getLogger, { setIsLoggerEnabled } from './logger';
import { ValueTypes } from './types/enums/ValueTypes';
import { Flow, FlowHandlerOptions } from './types/flow';
import { ConvertValuesToObject, Value } from './types/value';

const log = getLogger('Index');

export function getFlowHandler<NodeType extends UnknowEnum>({
  executors,
  enableLogger = false,
}: FlowHandlerOptions<NodeType>) {
  setIsLoggerEnabled(enableLogger);

  async function execute<
    InitialData extends Value<string, ValueTypes> = Value<string, ValueTypes>,
  >({ nodes, edges }: Flow<NodeType, ConvertValuesToObject<InitialData>>) {
    const executedNodeOutputs: ExecutedNodeOutputs = new Map();
    log('nodes', nodes);
    log('edges', edges);
    await executeFlow({ executors, nodes, edges, executedNodeOutputs });
  }

  return { execute };
}
