import { getFlowHandler } from '../src';
import { NodeType } from './mocks/enums/node-type';
import { NumberArrayLoopExecutor } from './mocks/number-array-loop-node';
import { OutputServiceMock } from './mocks/output-service';
import { SaveOutputExecutor } from './mocks/save-output-node';
import { SumExecutor } from './mocks/sum-node';
import { ValueExecutor } from './mocks/value-node';

let outputServiceMock: OutputServiceMock;
let flowHandler: ReturnType<typeof getFlowHandler>;

beforeAll(() => {
  outputServiceMock = new OutputServiceMock();

  flowHandler = getFlowHandler<NodeType>({ 
    executors: [new ValueExecutor(), new SumExecutor(), new SaveOutputExecutor(outputServiceMock), new NumberArrayLoopExecutor()]
   }) as ReturnType<typeof getFlowHandler>;
})

describe('loop-executor-workflow', () => {
  it('should sum multiple number pairs', async () => {
    await flowHandler.execute({
      nodes: [
        { id: 'number_list', type: NodeType.NUMBER_ARRAY_LOOP, input: {}, output: {}, data: { array: [[1, 1], [2, 2]] } },
        { id: 'sum', type: NodeType.SUM, input: {}, output: {} },
        { id: 'save-output', type: NodeType.SAVE_OUTPUT, input: {}, output: {}, data: { key: 'sumResult' } },
      ],
      edges: [
        { source: 'number_list', target: 'sum', sourceValue: 'num0', targetValue: 'num0' },
        { source: 'number_list', target: 'sum', sourceValue: 'num1', targetValue: 'num1' },
        { source: 'sum', target: 'save-output', sourceValue: 'result', targetValue: 'value' },
      ],
    });

    const sumResult = outputServiceMock.getOutput('sumResult');

    expect(sumResult).toStrictEqual([2, 4]);
  });
});
