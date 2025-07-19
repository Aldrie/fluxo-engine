import { FluxoWaitSignalException } from '../exceptions/wait-signal-exception';
import getLogger from '../logger';
import { ExecutionContext } from '../types/context';
import { UnknowEnum } from '../types/core';
import { WaitExecutor } from '../types/executor';
import { ExecutionSnapshot, PendingWait } from '../types/snapshot';
import { mapNodeOutputsToInput } from '../utils/edge-mapping';
import { mapToObject } from '../utils/map';
import { getNextNode } from '../utils/node';

interface WaitOptions<NodeType extends UnknowEnum> extends ExecutionContext<NodeType> {
  executor: WaitExecutor<NodeType>;
  key: string;
}

const log = getLogger('WaitNode');

export async function executeWaitNode<NodeType extends UnknowEnum>(
  opts: WaitOptions<NodeType>,
  resumeExecution: (ctx: ExecutionContext<NodeType>) => Promise<any>
): Promise<any> {
  const {
    node,
    inputEdgesMap,
    executor,
    executedNodeOutputs,
    initialNodeIds,
    iterationContext = [],
    key,
  } = opts;

  try {
    const input = mapNodeOutputsToInput({
      node,
      inputEdgesMap,
      executedNodeOutputs,
      iteration: iterationContext.at(-1),
    });
    const output = await executor.execute(input, node.data, {});

    executedNodeOutputs.set(key, output);

    const next = getNextNode(opts);

    if (next && !initialNodeIds.includes(next.id)) {
      await resumeExecution({ ...opts, node: next });
    }

    return output;
  } catch (e) {
    if (e instanceof FluxoWaitSignalException) {
      const snapshot: ExecutionSnapshot = {
        executedNodeOutputs: mapToObject(executedNodeOutputs),
        pending: [
          { nodeId: node.id, iteration: [...(opts.iterationContext || [])] },
        ] as PendingWait[],
      };

      log('[DEBUG WAIT] gerando snapshot de pausa:', JSON.stringify(snapshot, null, 2));
      throw new FluxoWaitSignalException(snapshot);
    }
    throw e;
  }
}
