import { getFlowHandler } from '../src';
import { NodeType } from './mocks/enums/node-type';
import { OutputServiceMock } from './mocks/output-service';
import { SumExecutor } from './mocks/sum-node';
import { ValueExecutor } from './mocks/value-node';

let outputServiceMock: OutputServiceMock;
let flowHandler: ReturnType<typeof getFlowHandler>;

beforeAll(() => {
  outputServiceMock = new OutputServiceMock();

  flowHandler = getFlowHandler<NodeType>({ 
    executors: [new ValueExecutor(), new SumExecutor(outputServiceMock)]
   }) as ReturnType<typeof getFlowHandler>;
})

describe('simple-workflow', () => {
  it('should sum two numbers', async () => {
    await flowHandler.execute({
      nodes: [
        { id: 'value_0', type: NodeType.VALUE, input: {}, output: {}, data: { value: 3 } },
        { id: 'value_1', type: NodeType.VALUE, input: {}, output: {}, data: { value: 2 } },
        { id: 'sum', type: NodeType.SUM, input: {}, output: {}, data: { resultKey: 'sumResult' } },
      ],
      edges: [
        { source: 'value_0', target: 'sum', sourceValue: 'value', targetValue: 'num0' },
        { source: 'value_1', target: 'sum', sourceValue: 'value', targetValue: 'num1' },
      ],
    });

    const sumResult = outputServiceMock.getOutput('sumResult');

    expect(sumResult).toBe(5);
  });
});
