import { ConvertValuesToObject, Edge, Flow, FlowExecutionStatus, getFlowHandler } from '../src';
import { NodeType } from './mocks/enums/node-type';
import { DelayedSumExecutor, DelayedSumNodeResumeData } from './mocks/delayed-sum-node';
import { NumberArrayLoopExecutor } from './mocks/number-array-loop-node';
import { GreaterThanNodeExecutor } from './mocks/greater-than-node';
import { SaveOutputExecutor } from './mocks/save-output-node';
import { ValueExecutor } from './mocks/value-node';
import { OutputServiceMock } from './mocks/output-service';

let outputServiceMock: OutputServiceMock;
let flowHandler: ReturnType<typeof getFlowHandler>;

beforeAll(() => {
  outputServiceMock = new OutputServiceMock();

  flowHandler = getFlowHandler<NodeType>({
    executors: [
      new NumberArrayLoopExecutor(),
      new DelayedSumExecutor(),
      new ValueExecutor(),
      new GreaterThanNodeExecutor(),
      new SaveOutputExecutor(outputServiceMock),
    ],
    enableLogger: true,
  }) as ReturnType<typeof getFlowHandler>;
});

describe('complete workflow: loop + delayed sum + branch', () => {
  it('should pause after delayed sum and then complete with correct output after resume', async () => {
    const nodes = [
      {
        id: 'dataList',
        type: NodeType.NUMBER_ARRAY_LOOP,
        input: {},
        output: {},
        data: {
          array: [[3], [7], [11]],
        },
      },
      {
        id: 'delayedSum',
        type: NodeType.DELAYED_SUM,
        input: {},
        output: {},
        data: { delay: true },
      },
      {
        id: 'addition',
        type: NodeType.VALUE,
        input: {},
        output: {},
        data: { value: 10 },
      },
      {
        id: 'limit',
        type: NodeType.VALUE,
        input: {},
        output: {},
        data: { value: 20 },
      },
      {
        id: 'finalDecision',
        type: NodeType.GREATER_THAN,
        input: {},
        output: {},
      },
      {
        id: 'sumOutput',
        type: NodeType.SAVE_OUTPUT,
        input: {},
        output: {},
        data: { key: 'finalOutput', defaultValue: 'SUM' },
      },
      {
        id: 'averageOutput',
        type: NodeType.SAVE_OUTPUT,
        input: {},
        output: {},
        data: { key: 'finalOutput', defaultValue: 'AVERAGE' },
      },
    ];

    const edges: Edge[] = [
      { source: 'dataList', target: 'delayedSum', sourceValue: 'num0', targetValue: 'num0' },
      { source: 'addition', target: 'delayedSum', sourceValue: 'value', targetValue: 'num1' },
      { source: 'delayedSum', target: 'finalDecision', sourceValue: 'result', targetValue: 'num0' },
      { source: 'limit', target: 'finalDecision', sourceValue: 'value', targetValue: 'num1' },
      { source: 'finalDecision', target: 'sumOutput', branch: 'isNotGreater' },
      { source: 'finalDecision', target: 'averageOutput', branch: 'isGreater' },
    ];

    const config: Flow<NodeType, ConvertValuesToObject<any>> = { nodes, edges };

    const result = await flowHandler.execute(config);
    expect(result.status).toBe(FlowExecutionStatus.WAITING);

    const snapshot = (result as any).snapshot!;

    expect(snapshot.pending).toHaveLength(3);
    expect(snapshot.pending.map((p: any) => p.nodeId)).toEqual([
      'delayedSum',
      'delayedSum',
      'delayedSum',
    ]);

    const resumeResult = await flowHandler.resume({
      nodes,
      edges,
      snapshot,
      resolved: [
        {
          nodeId: 'delayedSum',
          iterationContext: [0],
          resumeData: { resolveExecution: true } satisfies DelayedSumNodeResumeData,
        },
        {
          nodeId: 'delayedSum',
          iterationContext: [1],
          resumeData: { resolveExecution: true } satisfies DelayedSumNodeResumeData,
        },
        {
          nodeId: 'delayedSum',
          iterationContext: [2],
          resumeData: { resolveExecution: true } satisfies DelayedSumNodeResumeData,
        },
      ],
    });

    expect(resumeResult.status).toBe(FlowExecutionStatus.COMPLETED);
    expect(outputServiceMock.getOutput('finalOutput')).toStrictEqual(['SUM', 'SUM', 'AVERAGE']);
  });
});
