import { ConvertValuesToObject, Flow, getFlowHandler } from '../src';
import { NodeType } from './mocks/enums/node-type';
import { GreaterThanNodeExecutor } from './mocks/greater-than-node';
import { NumberArrayLoopExecutor } from './mocks/number-array-loop-node';
import { SaveOutputExecutor } from './mocks/save-output-node';
import { ValueExecutor } from './mocks/value-node';
import { OutputServiceMock } from './mocks/output-service';

let outputServiceMock: OutputServiceMock;
let flowHandler: ReturnType<typeof getFlowHandler>;

beforeAll(() => {
  outputServiceMock = new OutputServiceMock();

  flowHandler = getFlowHandler<NodeType>({
    executors: [
      new ValueExecutor(),
      new NumberArrayLoopExecutor(),
      new GreaterThanNodeExecutor(),
      new SaveOutputExecutor(outputServiceMock),
    ],
  }) as ReturnType<typeof getFlowHandler>;
});

describe('loop-branch-executor-workflow', () => {
  it('should execute branch within loop correctly', async () => {
    const nodes = [
      {
        id: 'threshold',
        type: NodeType.VALUE,
        input: {},
        output: {},
        data: { value: 4 },
      },
      {
        id: 'numbers',
        type: NodeType.NUMBER_ARRAY_LOOP,
        input: {},
        output: {},
        data: {
          array: [
            [5, 0],
            [3, 0],
          ],
        },
      },
      {
        id: 'check',
        type: NodeType.GREATER_THAN,
        input: {},
        output: {},
      },
      {
        id: 'pass',
        type: NodeType.SAVE_OUTPUT,
        input: {},
        output: {},
        data: { key: 'passOutput', defaultValue: 'passed' },
      },
      {
        id: 'fail',
        type: NodeType.SAVE_OUTPUT,
        input: {},
        output: {},
        data: { key: 'failOutput', defaultValue: 'failed' },
      },
    ];

    const edges = [
      { source: 'numbers', target: 'check', sourceValue: 'num0', targetValue: 'num0' },
      { source: 'threshold', target: 'check', sourceValue: 'value', targetValue: 'num1' },
      { source: 'check', target: 'pass', branch: 'isGreater' },
      { source: 'check', target: 'fail', branch: 'isNotGreater' },
    ];

    const config: Flow<NodeType, ConvertValuesToObject<any>> = {
      nodes,
      edges,
    };

    await flowHandler.execute(config);

    const passOutputs = outputServiceMock.getOutput('passOutput');
    const failOutputs = outputServiceMock.getOutput('failOutput');

    expect(passOutputs).toStrictEqual(['passed']);
    expect(failOutputs).toStrictEqual(['failed']);
  });
});
