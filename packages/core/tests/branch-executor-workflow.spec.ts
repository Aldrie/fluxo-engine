import { ConvertValuesToObject, Flow, getFlowHandler, FlowExecutionStatus } from '../src';
import { NodeType } from './mocks/enums/node-type';
import { GreaterThanNodeExecutor } from './mocks/greater-than-node';
import { NumberArrayLoopExecutor } from './mocks/number-array-loop-node';
import { ObjectArrayLoopExecutor } from './mocks/object-array-loop-node';
import { ValueIsNodeExecutor } from './mocks/value-is-node';
import { OutputServiceMock } from './mocks/output-service';
import { SaveOutputExecutor } from './mocks/save-output-node';
import { ValueExecutor } from './mocks/value-node';

let out: OutputServiceMock;
let flow: ReturnType<typeof getFlowHandler>;

beforeAll(() => {
  out = new OutputServiceMock();
  flow = getFlowHandler<NodeType>({
    enableLogger: false,
    executors: [
      new ValueExecutor(),
      new NumberArrayLoopExecutor(),
      new ObjectArrayLoopExecutor(),
      new GreaterThanNodeExecutor(),
      new ValueIsNodeExecutor(),
      new SaveOutputExecutor(out),
    ],
  }) as ReturnType<typeof getFlowHandler>;
});

describe('branch-executor-workflow', () => {
  const baseValue = { id: 'user_age', type: NodeType.VALUE, input: {}, output: {} };

  const template: Flow<NodeType, ConvertValuesToObject<any>> = {
    nodes: [
      { id: 'min_age', type: NodeType.VALUE, input: {}, output: {}, data: { value: 18 } },
      { id: 'greater_than', type: NodeType.GREATER_THAN, input: {}, output: {} },
      {
        id: 'allow',
        type: NodeType.SAVE_OUTPUT,
        input: {},
        output: {},
        data: { key: 'canDriveAllow', defaultValue: true },
      },
      {
        id: 'block',
        type: NodeType.SAVE_OUTPUT,
        input: {},
        output: {},
        data: { key: 'canDriveBlock', defaultValue: false },
      },
    ],
    edges: [
      { source: 'user_age', target: 'greater_than', sourceValue: 'value', targetValue: 'num0' },
      { source: 'min_age', target: 'greater_than', sourceValue: 'value', targetValue: 'num1' },
      { source: 'greater_than', target: 'allow', branch: 'isGreater' },
      { source: 'greater_than', target: 'block', branch: 'isNotGreater' },
    ],
  };

  it('should block user from driving (only block branch executed)', async () => {
    await flow.execute({
      ...template,
      nodes: [...template.nodes, { ...baseValue, data: { value: 3 } }],
    });
    expect(out.getOutput('canDriveBlock')).toStrictEqual([false]);
    expect(out.getOutput('canDriveAllow')).toBeUndefined();
    out.clear();
  });

  it('should allow user to drive (only allow branch executed)', async () => {
    await flow.execute({
      ...template,
      nodes: [...template.nodes, { ...baseValue, data: { value: 22 } }],
    });
    expect(out.getOutput('canDriveAllow')).toStrictEqual([true]);
    expect(out.getOutput('canDriveBlock')).toBeUndefined();
  });
});

/* ----------------------------------------------------------------------------
   2. branch BEFORE loop – decides whether to iterate or take single value
-----------------------------------------------------------------------------*/

describe('branch before loop workflow', () => {
  const build = (kind: 'loop' | 'single'): Flow<NodeType, ConvertValuesToObject<any>> => ({
    nodes: [
      { id: 'operation', type: NodeType.VALUE, input: {}, output: {}, data: { value: kind } },
      {
        id: 'isLoop',
        type: NodeType.VALUE_IS,
        input: {},
        output: {},
        data: { valueToCompare: 'loop' },
      },
      {
        id: 'nums',
        type: NodeType.NUMBER_ARRAY_LOOP,
        input: {},
        output: {},
        data: { array: [[1], [2], [3]] },
      },
      {
        id: 'eachSave',
        type: NodeType.SAVE_OUTPUT,
        input: {},
        output: {},
        data: { key: 'loopOut' },
      },
      { id: 'singleValue', type: NodeType.VALUE, input: {}, output: {}, data: { value: 42 } },
      {
        id: 'singleSave',
        type: NodeType.SAVE_OUTPUT,
        input: {},
        output: {},
        data: { key: 'singleOut' },
      },
    ],
    edges: [
      { source: 'operation', target: 'isLoop', sourceValue: 'value', targetValue: 'value' },
      { source: 'isLoop', target: 'nums', branch: 'true' },
      { source: 'isLoop', target: 'singleSave', branch: 'false' },
      { source: 'nums', target: 'eachSave', sourceValue: 'num0', targetValue: 'value' },
      { source: 'singleValue', target: 'singleSave', sourceValue: 'value', targetValue: 'value' },
    ],
  });

  it('iterates when operation = loop', async () => {
    await flow.execute(build('loop'));
    expect(out.getOutput('loopOut')).toStrictEqual([1, 2, 3]);
    expect(out.getOutput('singleOut')).toBeUndefined();
    out.clear();
  });

  it('bypasses loop when operation = single', async () => {
    await flow.execute(build('single'));
    expect(out.getOutput('singleOut')).toStrictEqual([42]);
    expect(out.getOutput('loopOut')).toBeUndefined();
    out.clear();
  });
});

/* ----------------------------------------------------------------------------
   3. branch INSIDE loop – filters each iteration individually
-----------------------------------------------------------------------------*/

describe('branch inside loop workflow', () => {
  it('stores only elements matching condition', async () => {
    const nodes = [
      {
        id: 'ops',
        type: NodeType.VALUE,
        input: {},
        output: {},
        data: { value: ['save', 'skip', 'save'] },
      },
      { id: 'loop', type: NodeType.NUMBER_ARRAY_LOOP, input: {}, output: {} },
      {
        id: 'isSave',
        type: NodeType.VALUE_IS,
        input: {},
        output: {},
        data: { valueToCompare: 'save' },
      },
      { id: 'save', type: NodeType.SAVE_OUTPUT, input: {}, output: {}, data: { key: 'saved' } },
    ];
    const edges = [
      { source: 'ops', target: 'loop', sourceValue: 'value', targetValue: 'num0' },
      { source: 'loop', target: 'isSave', sourceValue: 'num0', targetValue: 'value' },
      { source: 'loop', target: 'save', sourceValue: 'num0', targetValue: 'value' },
      { source: 'isSave', target: 'save', branch: 'true' },
    ];
    await flow.execute({ nodes, edges });
    expect(out.getOutput('saved')).toStrictEqual(['save', 'save']);
    out.clear();
  });
});

/* ----------------------------------------------------------------------------
   4. combined: outer branch chooses multi vs single; inner branch filters loop
-----------------------------------------------------------------------------*/

describe('mixed branch + loop workflow', () => {
  const make = (kind: 'multi' | 'single'): Flow<NodeType, ConvertValuesToObject<any>> => ({
    nodes: [
      { id: 'kind', type: NodeType.VALUE, input: {}, output: {}, data: { value: kind } },
      {
        id: 'isMulti',
        type: NodeType.VALUE_IS,
        input: {},
        output: {},
        data: { valueToCompare: 'multi' },
      },

      {
        id: 'ops',
        type: NodeType.VALUE,
        input: {},
        output: {},
        data: { value: [{ op: 'save' }, { op: 'ignore' }, { op: 'save' }] },
      },
      { id: 'loop', type: NodeType.OBJECT_ARRAY_LOOP, input: {}, output: {} },

      {
        id: 'isSave',
        type: NodeType.VALUE_IS,
        input: {},
        output: {},
        data: { valueToCompare: 'save' },
      },
      {
        id: 'saveInside',
        type: NodeType.SAVE_OUTPUT,
        input: {},
        output: {},
        data: { key: 'saved' },
      },

      { id: 'directVal', type: NodeType.VALUE, input: {}, output: {}, data: { value: 'direct' } },
      {
        id: 'directSave',
        type: NodeType.SAVE_OUTPUT,
        input: {},
        output: {},
        data: { key: 'direct' },
      },
    ],
    edges: [
      { source: 'kind', target: 'isMulti', sourceValue: 'value', targetValue: 'value' },

      { source: 'isMulti', target: 'loop', branch: 'true' },
      { source: 'isMulti', target: 'directSave', branch: 'false' },

      { source: 'ops', target: 'loop', sourceValue: 'value', targetValue: 'object_array' },

      { source: 'loop', target: 'isSave', sourceValue: 'op', targetValue: 'value' },
      { source: 'loop', target: 'saveInside', sourceValue: 'op', targetValue: 'value' },
      { source: 'isSave', target: 'saveInside', branch: 'true' },

      { source: 'directVal', target: 'directSave', sourceValue: 'value', targetValue: 'value' },
    ],
  });

  it('multi path stores filtered results', async () => {
    await flow.execute(make('multi'));
    expect(out.getOutput('saved')).toStrictEqual(['save', 'save']);
    expect(out.getOutput('direct')).toBeUndefined();
    out.clear();
  });

  it('single path stores direct value', async () => {
    await flow.execute(make('single'));
    expect(out.getOutput('direct')).toStrictEqual(['direct']);
    expect(out.getOutput('saved')).toBeUndefined();
  });
});
