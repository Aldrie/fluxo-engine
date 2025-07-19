import {
  ConvertValuesToObject,
  ExecutionSnapshot,
  Flow,
  FlowExecutionStatus,
  getFlowHandler,
} from '../src';
import { NodeType } from './mocks/enums/node-type';
import { OutputServiceMock } from './mocks/output-service';
import { SaveOutputExecutor } from './mocks/save-output-node';
import { ValueExecutor } from './mocks/value-node';
import { WaitForeverExecutor } from './mocks/wait-node';

let flowHandler: ReturnType<typeof getFlowHandler>;
let outputService: OutputServiceMock;
let snapshot: ExecutionSnapshot;

beforeAll(() => {
  outputService = new OutputServiceMock();
  flowHandler = getFlowHandler<any>({
    enableLogger: true,
    executors: [
      new ValueExecutor(),
      new WaitForeverExecutor(),
      new SaveOutputExecutor(outputService),
    ],
  });
});

const nodes: Flow<NodeType, ConvertValuesToObject<any>>['nodes'] = [
  { id: 'start', type: NodeType.VALUE, input: {}, output: {}, data: { value: 7 } },
  { id: 'wait', type: NodeType.WAIT_FOREVER, input: {}, output: {} },
  { id: 'save', type: NodeType.SAVE_OUTPUT, input: {}, output: {}, data: { key: 'final' } },
];

const edges = [
  { source: 'start', target: 'wait', sourceValue: 'value', targetValue: 'value' },
  { source: 'wait', target: 'save', sourceValue: 'value', targetValue: 'value' },
];

describe('wait-and-resume workflow', () => {
  it('should pause on wait and return WAITING', async () => {
    const result = await flowHandler.execute({ nodes, edges });
    expect(result.status).toBe(FlowExecutionStatus.WAITING);
    snapshot = (result as any).snapshot;
    expect(Object.keys(snapshot.executedNodeOutputs)).toHaveLength(1);
    expect(snapshot.pending).toHaveLength(1);
    expect(snapshot.pending[0].nodeId).toBe('wait');
    expect(snapshot.pending[0].iteration).toStrictEqual([]);
  });

  it('should resume and complete the flow immediately', async () => {
    const resumeResult = await flowHandler.resume({
      nodes,
      edges,
      snapshot,
      resolved: [{ nodeId: 'wait', output: { value: 42 } }],
    });
    expect(resumeResult.status).toBe(FlowExecutionStatus.COMPLETED);
    expect(outputService.getOutput('final')).toStrictEqual([42]);
  });

  it('should resume after a delay and complete the flow', async () => {
    const execResult = await flowHandler.execute({ nodes, edges });
    const delayedSnapshot = (execResult as any).snapshot as ExecutionSnapshot;

    await new Promise((r) => setTimeout(r, 20));

    const delayedResume = await flowHandler.resume({
      nodes,
      edges,
      snapshot: delayedSnapshot,
      resolved: [{ nodeId: 'wait', output: { value: 99 } }],
    });
    expect(delayedResume.status).toBe(FlowExecutionStatus.COMPLETED);
    expect(outputService.getOutput('final')).toStrictEqual([42, 99]);
  });
});
