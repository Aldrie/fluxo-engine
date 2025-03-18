import { ConvertValuesToObject, Flow, getFlowHandler } from '../src';
import { NodeType } from './mocks/enums/node-type';
import { ObjectArrayLoopExecutor } from './mocks/object-array-loop-node';
import { OutputServiceMock } from './mocks/output-service';
import { SaveOutputExecutor } from './mocks/save-output-node';
import { ValueExecutor } from './mocks/value-node';
import { faker } from '@faker-js/faker';

let outputServiceMock: OutputServiceMock;
let flowHandler: ReturnType<typeof getFlowHandler>;

beforeAll(() => {
  outputServiceMock = new OutputServiceMock();

  flowHandler = getFlowHandler<NodeType>({
    executors: [
      new ValueExecutor(),
      new ObjectArrayLoopExecutor(),
      new SaveOutputExecutor(outputServiceMock),
    ],
  }) as ReturnType<typeof getFlowHandler>;
});

describe('nested-loop-workflow', () => {
  const names = Array.from({ length: 2 }).map(() => faker.person.firstName());

  const userWithOrders = {
    name: faker.person.firstName(),
    age: faker.number.int({ min: 8, max: 65 }),
    orders: [{ total: 10 }, { total: 8 }, { total: 50 }, { total: 2 }, { total: 30 }],
  };

  const nodes = [
    {
      id: 'data',
      type: NodeType.VALUE,
      input: {},
      output: {},
      data: {
        value: [
          ...names.map((name) => ({
            name,
            age: faker.number.int({ min: 8, max: 65 }),
            orders: [],
          })),
          userWithOrders,
        ],
      },
    },
    {
      id: 'outerLoop',
      type: NodeType.OBJECT_ARRAY_LOOP,
      input: {},
      output: {},
    },
    {
      id: 'userNames_output',
      type: NodeType.SAVE_OUTPUT,
      input: {},
      output: {},
      data: { key: 'userNames' },
    },
    {
      id: 'innerLoop',
      type: NodeType.OBJECT_ARRAY_LOOP,
      input: {},
      output: {},
    },
    {
      id: 'order_totals_output',
      type: NodeType.SAVE_OUTPUT,
      input: {},
      output: {},
      data: { key: 'orderTotals' },
    },
  ];

  const edges = [
    { source: 'data', target: 'outerLoop', sourceValue: 'value', targetValue: 'object_array' },
    { source: 'outerLoop', target: 'userNames_output', sourceValue: 'name', targetValue: 'value' },
    {
      source: 'outerLoop',
      target: 'innerLoop',
      sourceValue: 'orders',
      targetValue: 'object_array',
    },
    {
      source: 'innerLoop',
      target: 'order_totals_output',
      sourceValue: 'total',
      targetValue: 'value',
    },
  ];

  const config: Flow<NodeType, ConvertValuesToObject<any>> = { nodes, edges };

  it('should execute nested loops correctly', async () => {
    await flowHandler.execute(config);

    const userNames = outputServiceMock.getOutput('userNames');
    expect(userNames).toStrictEqual([...names, userWithOrders.name]);

    const orderTotals = outputServiceMock.getOutput('orderTotals');
    expect(orderTotals).toStrictEqual([...userWithOrders.orders.map((order) => order.total)]);
  });
});
