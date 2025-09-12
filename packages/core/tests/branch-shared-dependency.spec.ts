import { ConvertValuesToObject, Flow, getFlowHandler } from '../src';
import { NodeType } from './mocks/enums/node-type';
import { ValueExecutor } from './mocks/value-node';
import { ValueIsNodeExecutor } from './mocks/value-is-node';
import { SaveOutputExecutor } from './mocks/save-output-node';
import { OutputServiceMock } from './mocks/output-service';

let out: OutputServiceMock;
let flow: ReturnType<typeof getFlowHandler>;

beforeAll(() => {
  out = new OutputServiceMock();
  flow = getFlowHandler<NodeType>({
    enableLogger: true,
    executors: [new ValueExecutor(), new ValueIsNodeExecutor(), new SaveOutputExecutor(out)],
  }) as ReturnType<typeof getFlowHandler>;
});

describe('branch target with shared dependency should wait for the dependent node', () => {
  const build = (cond: boolean): Flow<NodeType, ConvertValuesToObject<any>> => ({
    nodes: [
      { id: 'cond', type: NodeType.VALUE, input: {}, output: {}, data: { value: cond } },

      { id: 'imgGen', type: NodeType.VALUE, input: {}, output: {}, data: { value: 'IMG_OK' } },

      {
        id: 'isTrue',
        type: NodeType.VALUE_IS,
        input: {},
        output: {},
        data: { valueToCompare: true },
      },

      { id: 'tplA', type: NodeType.VALUE, input: {}, output: {}, data: {} },
      { id: 'tplB', type: NodeType.VALUE, input: {}, output: {}, data: {} },

      { id: 'saveA', type: NodeType.SAVE_OUTPUT, input: {}, output: {}, data: { key: 'A' } },
      { id: 'saveB', type: NodeType.SAVE_OUTPUT, input: {}, output: {}, data: { key: 'B' } },
    ],
    edges: [
      { source: 'cond', target: 'isTrue', sourceValue: 'value', targetValue: 'value' },

      { source: 'imgGen', target: 'tplA', sourceValue: 'value', targetValue: 'value' },
      { source: 'imgGen', target: 'tplB', sourceValue: 'value', targetValue: 'value' },

      { source: 'isTrue', target: 'tplA', branch: 'true' },
      { source: 'isTrue', target: 'tplB', branch: 'false' },

      { source: 'tplA', target: 'saveA', sourceValue: 'value', targetValue: 'value' },
      { source: 'tplB', target: 'saveB', sourceValue: 'value', targetValue: 'value' },
    ],
  });

  it('when cond=true: tplA should run and save IMG_OK (imgGen runs first)', async () => {
    await flow.execute(build(true));
    expect(out.getOutput('A')).toStrictEqual(['IMG_OK']);
    expect(out.getOutput('B')).toBeUndefined();
    out.clear();
  });

  it('when cond=false: tplB should run and save IMG_OK (imgGen runs first)', async () => {
    await flow.execute(build(false));
    expect(out.getOutput('B')).toStrictEqual(['IMG_OK']);
    expect(out.getOutput('A')).toBeUndefined();
    out.clear();
  });
});
