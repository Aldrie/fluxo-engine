import { ConvertValuesToObject, Edge, Flow, getFlowHandler } from '../src';
import { NodeType } from './mocks/enums/node-type';
import { SumExecutor } from './mocks/sum-node';
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
      new SumExecutor(),
      new ValueExecutor(),
      new GreaterThanNodeExecutor(),
      new SaveOutputExecutor(outputServiceMock),
    ],
    enableLogger: false,
  }) as ReturnType<typeof getFlowHandler>;
});

describe('complete workflow: loop + aggregation + branch', () => {
  it('should aggregate loop outputs, compare with threshold and choose the correct branch', async () => {
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
        id: 'sum',
        type: NodeType.SUM,
        input: {},
        output: {},
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
      { source: 'dataList', target: 'sum', sourceValue: 'num0', targetValue: 'num0' },
      { source: 'addition', target: 'sum', sourceValue: 'value', targetValue: 'num1' },
      { source: 'sum', target: 'finalDecision', sourceValue: 'result', targetValue: 'num0' },
      { source: 'limit', target: 'finalDecision', sourceValue: 'value', targetValue: 'num1' },
      { source: 'finalDecision', target: 'sumOutput', branch: 'isNotGreater' },
      { source: 'finalDecision', target: 'averageOutput', branch: 'isGreater' },
    ];

    const config: Flow<NodeType, ConvertValuesToObject<any>> = { nodes, edges };

    await flowHandler.execute(config);

    const finalOutput = outputServiceMock.getOutput('finalOutput');
    expect(finalOutput).toStrictEqual(['SUM', 'SUM', 'AVERAGE']);
  });
});
