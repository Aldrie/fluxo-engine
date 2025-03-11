import { ConvertValuesToObject, Flow, getFlowHandler } from '../src';
import { NodeType } from './mocks/enums/node-type';
import { GreaterThanNodeExecutor } from './mocks/greater-than-node';
import { OutputServiceMock } from './mocks/output-service';
import { SaveOutputExecutor } from './mocks/save-output-node';
import { ValueExecutor } from './mocks/value-node';

let outputServiceMock: OutputServiceMock;
let flowHandler: ReturnType<typeof getFlowHandler>;

beforeAll(() => {
  outputServiceMock = new OutputServiceMock();

  flowHandler = getFlowHandler<NodeType>({
    executors: [new ValueExecutor(), new GreaterThanNodeExecutor(), new SaveOutputExecutor(outputServiceMock)],
  }) as ReturnType<typeof getFlowHandler>;
})

describe('branch-executor-workflow', () => {
  const userAgeNodeBase = { id: 'user_age', type: NodeType.VALUE, input: {}, output: {} };

  const config: Flow<NodeType, ConvertValuesToObject<any>> = {
    nodes: [
      { id: 'min_age', type: NodeType.VALUE, input: {}, output: {}, data: { value: 18 } },
      { id: 'greater_than', type: NodeType.GREATER_THAN, input: {}, output: {} },
      { id: 'allow', type: NodeType.SAVE_OUTPUT, input: {}, output: {}, data: { key: 'canDrive', defaultValue: true } },
      { id: 'block', type: NodeType.SAVE_OUTPUT, input: {}, output: {}, data: { key: 'canDrive', defaultValue: false } },
    ],
    edges: [
      { source: 'user_age', target: 'greater_than', sourceValue: 'value', targetValue: 'num0' },
      { source: 'min_age', target: 'greater_than', sourceValue: 'value', targetValue: 'num1' },
      { source: 'greater_than', target: 'allow', branch: 'isGreater' },
      { source: 'greater_than', target: 'block', branch: 'isNotGreater' },
    ],
  };

  it('should block user from driving', async () => {
    await flowHandler.execute({
      ...config,
      nodes: [
        ...config.nodes,
        { ...userAgeNodeBase, data: { value: 3 } },
      ],
    });

    const canDriveOutputs = outputServiceMock.getOutput('canDrive') as boolean[];
    const [canDrive] = canDriveOutputs;

    expect(canDrive).toBe(false);
  });

  it('should allow user to drive', async () => {
    await flowHandler.execute({
      ...config,
      nodes: [
        ...config.nodes,
        { ...userAgeNodeBase, data: { value: 22 } },
      ],
    });

    const canDriveOutputs = outputServiceMock.getOutput('canDrive') as boolean[];
    const [_, canDrive] = canDriveOutputs;

    expect(canDrive).toBe(true);
  });
});
