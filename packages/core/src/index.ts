export * from './utils/flow';

export * from './types/context';
export * from './types/edge';
export * from './types/enums/ExecutorBehavior';
export * from './types/enums/ValueTypes';
export * from './types/executor';
export * from './types/flow';
export * from './types/node';
export * from './types/snapshot';
export * from './types/value';
export * from './execution/flow';

import { resumeFlow, executeFlow } from './execution/flow';

import { ExecutedNodeOutputs, UnknowEnum } from './types/core';
import { ValueTypes } from './types/enums/ValueTypes';
import { ConvertValuesToObject, Value } from './types/value';
import { Flow, FlowExecutionResult, FlowHandlerOptions, ResumeFlowOptions } from './types/flow';

import { buildExecutionContextCache } from './utils/execution-context';
import { objectToMap } from './utils/map';
import { buildResumeEntries } from './utils/resume-entries';

import { setIsLoggerEnabled } from './logger';

export function getFlowHandler<NodeType extends UnknowEnum>({
  executors,
  enableLogger = false,
}: FlowHandlerOptions<NodeType>) {
  setIsLoggerEnabled(enableLogger);

  async function execute<
    InitialData extends Value<string, ValueTypes> = Value<string, ValueTypes>,
  >({
    nodes,
    edges,
  }: Flow<NodeType, ConvertValuesToObject<InitialData>>): Promise<FlowExecutionResult> {
    const executedNodeOutputs: ExecutedNodeOutputs = new Map();

    const executionContextCache = buildExecutionContextCache({
      nodes,
      edges,
      executors,
    });

    return executeFlow(executors, nodes, edges, executedNodeOutputs, executionContextCache);
  }

  async function resume({
    nodes,
    edges,
    snapshot,
    resolved,
  }: ResumeFlowOptions<NodeType>): Promise<FlowExecutionResult> {
    const executedNodeOutputs = objectToMap(snapshot.executedNodeOutputs);

    const resumeEntries = buildResumeEntries({
      resolved,
      snapshot,
    });

    const executionContextCache = buildExecutionContextCache({ nodes, edges, executors });

    return resumeFlow({
      nodes,
      edges,
      snapshot,
      executors,
      executionContextCache,
      executedNodeOutputs,
      resumeEntries,
    });
  }

  return { execute, resume };
}
