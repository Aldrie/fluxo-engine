import { describe, it, expect, beforeAll } from 'vitest';
import { faker } from '@faker-js/faker';

import { getFlowHandler, FlowExecutionStatus } from '../src';
import { NodeType } from './mocks/enums/node-type';
import { OutputServiceMock } from './mocks/output-service';
import { ObjectArrayLoopExecutor } from './mocks/object-array-loop-node';
import { ValueExecutor } from './mocks/value-node';
import { WaitForeverExecutor } from './mocks/wait-node';
import { SaveOutputExecutor } from './mocks/save-output-node';

describe('batch wait workflow', () => {
  let flowHandler: ReturnType<typeof getFlowHandler>;
  let outputService: OutputServiceMock;

  const N = 10;
  const users = Array.from({ length: N }, () => ({ id: faker.string.uuid() }));

  beforeAll(() => {
    outputService = new OutputServiceMock();
    flowHandler = getFlowHandler<NodeType>({
      executors: [
        new ValueExecutor(),
        new ObjectArrayLoopExecutor(),
        new WaitForeverExecutor(),
        new SaveOutputExecutor(outputService),
      ],
      enableLogger: false,
    }) as ReturnType<typeof getFlowHandler>;
  });

  it('should pause and accumulate pending entries for all users', async () => {
    const nodes = [
      {
        id: 'starter',
        type: NodeType.VALUE,
        input: {},
        output: {},
        data: { value: users },
      },
      {
        id: 'userLoop',
        type: NodeType.OBJECT_ARRAY_LOOP,
        input: {},
        output: {},
      },
      {
        id: 'waitNode',
        type: NodeType.WAIT_FOREVER,
        input: {},
        output: {},
      },
      {
        id: 'saveNode',
        type: NodeType.SAVE_OUTPUT,
        input: {},
        output: {},
        data: { key: 'results' },
      },
    ];

    const edges = [
      {
        source: 'starter',
        target: 'userLoop',
        sourceValue: 'value',
        targetValue: 'object_array',
      },

      {
        source: 'userLoop',
        target: 'waitNode',
        sourceValue: 'id',
        targetValue: 'value',
      },

      {
        source: 'waitNode',
        target: 'saveNode',
        sourceValue: 'value',
        targetValue: 'value',
      },
    ];

    const result = await flowHandler.execute({ nodes, edges });
    expect(result.status).toBe(FlowExecutionStatus.WAITING);

    const snapshot = (result as any).snapshot;

    expect(snapshot.pending).toHaveLength(N);

    const iters = snapshot.pending
      .map((p: any) => p.iteration[0])
      .sort((a: number, b: number) => a - b);
    expect(iters).toEqual([...Array(N).keys()]);
  });

  it('should resume only the selected user and save it', async () => {
    const nodes = [
      {
        id: 'starter',
        type: NodeType.VALUE,
        input: {},
        output: {},
        data: { value: users },
      },
      { id: 'userLoop', type: NodeType.OBJECT_ARRAY_LOOP, input: {}, output: {} },
      { id: 'waitNode', type: NodeType.WAIT_FOREVER, input: {}, output: {} },
      {
        id: 'saveNode',
        type: NodeType.SAVE_OUTPUT,
        input: {},
        output: {},
        data: { key: 'results' },
      },
    ];
    const edges = [
      {
        source: 'starter',
        target: 'userLoop',
        sourceValue: 'value',
        targetValue: 'object_array',
      },
      {
        source: 'userLoop',
        target: 'waitNode',
        sourceValue: 'id',
        targetValue: 'value',
      },
      {
        source: 'waitNode',
        target: 'saveNode',
        sourceValue: 'value',
        targetValue: 'value',
      },
    ];

    const execResult = await flowHandler.execute({ nodes, edges });
    const snapshot = execResult.snapshot;

    if (!snapshot) throw new Error('empty snapshot');

    const randomIndex = Math.floor(Math.random() * N);
    const randomUserId = users[randomIndex].id;

    const resumeResult = await flowHandler.resume({
      nodes,
      edges,
      snapshot,
      resolved: [
        {
          nodeId: 'waitNode',
          output: { value: randomUserId },
          iterationContext: [randomIndex],
        },
      ],
    });
    expect(resumeResult.status).toBe(FlowExecutionStatus.WAITING);

    expect(outputService.getOutput('results')).toStrictEqual([randomUserId]);

    expect((resumeResult as any).snapshot.pending).toHaveLength(N - 1);
  });
});
