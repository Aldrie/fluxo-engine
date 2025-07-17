import { Edge, FlowExecutionStatus, getFlowHandler } from '../src';
import { NodeType } from './mocks/enums/node-type';
import { GreaterThanNodeExecutor } from './mocks/greater-than-node';
import { NumberArrayLoopExecutor } from './mocks/number-array-loop-node';
import { OutputServiceMock } from './mocks/output-service';
import { SaveOutputExecutor } from './mocks/save-output-node';
import { SumExecutor } from './mocks/sum-node';
import { ValueExecutor } from './mocks/value-node';
import { WaitForeverExecutor } from './mocks/wait-node';

let outputService: OutputServiceMock;
let flowHandler: ReturnType<typeof getFlowHandler>;
let snapshot: any;

beforeAll(() => {
  outputService = new OutputServiceMock();
  flowHandler = getFlowHandler<NodeType>({
    executors: [
      new NumberArrayLoopExecutor(),
      new SumExecutor(),
      new ValueExecutor(),
      new GreaterThanNodeExecutor(),
      new WaitForeverExecutor(),
      new SaveOutputExecutor(outputService),
    ],
    enableLogger: false,
  }) as any;
});

describe('complete workflow with wait + loop + aggregation + branch', () => {
  const nodes = [
    {
      id: 'dataList',
      type: NodeType.NUMBER_ARRAY_LOOP,
      input: {},
      output: {},
      data: { array: [[3], [7], [11]] },
    },
    { id: 'sum', type: NodeType.SUM, input: {}, output: {} },
    { id: 'wait', type: NodeType.WAIT_FOREVER, input: {}, output: {} },
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
    { source: 'sum', target: 'wait', sourceValue: 'result', targetValue: 'value' },
    { source: 'wait', target: 'limit', sourceValue: 'value', targetValue: 'value' },
    { source: 'limit', target: 'finalDecision', sourceValue: 'value', targetValue: 'num1' },
    { source: 'wait', target: 'finalDecision', sourceValue: 'value', targetValue: 'num0' },
    { source: 'finalDecision', target: 'sumOutput', branch: 'isNotGreater' },
    { source: 'finalDecision', target: 'averageOutput', branch: 'isGreater' },
  ];

  it('should pause at the wait node and return WAITING', async () => {
    const result = await flowHandler.execute({ nodes, edges });
    expect(result.status).toBe(FlowExecutionStatus.WAITING);
    snapshot = (result as any).snapshot;
    expect(snapshot).toBeDefined();
    expect(snapshot.pending).toHaveLength(1);
    expect(snapshot.pending[0].nodeId).toBe('wait');
  });

  it('should resume from the snapshot and complete the workflow', async () => {
    let result = await flowHandler.resume({
      nodes,
      edges,
      snapshot,
      resolved: { nodeId: 'wait', output: { value: 'SUM' } },
    });
    expect(result.status).toBe(FlowExecutionStatus.WAITING);
    snapshot = result.snapshot!;

    result = await flowHandler.resume({
      nodes,
      edges,
      snapshot,
      resolved: { nodeId: 'wait', output: { value: 'SUM' } },
    });
    expect(result.status).toBe(FlowExecutionStatus.WAITING);
    snapshot = result.snapshot!;

    result = await flowHandler.resume({
      nodes,
      edges,
      snapshot,
      resolved: { nodeId: 'wait', output: { value: 'AVERAGE' } },
    });
    expect(result.status).toBe(FlowExecutionStatus.COMPLETED);

    expect(outputService.getOutput('finalOutput')).toStrictEqual(['SUM', 'SUM', 'AVERAGE']);
  });

  describe('additional cases', () => {
    beforeEach(() => {
      outputService = new OutputServiceMock();
      flowHandler = getFlowHandler<NodeType>({
        executors: [
          new NumberArrayLoopExecutor(),
          new SumExecutor(),
          new ValueExecutor(),
          new GreaterThanNodeExecutor(),
          new WaitForeverExecutor(),
          new SaveOutputExecutor(outputService),
        ],
        enableLogger: false,
      }) as any;

      snapshot = undefined;
    });

    it('should complete immediately with empty input array', async () => {
      const emptyNodes = [
        { ...nodes.find((n) => n.id === 'dataList')!, data: { array: [] } },
        ...nodes.filter((n) => n.id !== 'dataList'),
      ];

      const result = await flowHandler.execute({ nodes: emptyNodes, edges });
      expect(result.status).toBe(FlowExecutionStatus.COMPLETED);
      expect(outputService.getOutput('finalOutput')).toBeUndefined();
    });

    it('should use defaultValue (AVERAGE) on every iteration when wait always returns AVERAGE', async () => {
      const r0 = await flowHandler.execute({ nodes, edges });
      expect(r0.status).toBe(FlowExecutionStatus.WAITING);
      let snap = (r0 as any).snapshot!;

      const r1 = await flowHandler.resume({
        nodes,
        edges,
        snapshot: snap,
        resolved: { nodeId: 'wait', output: { value: 'AVERAGE' } },
      });
      expect(r1.status).toBe(FlowExecutionStatus.WAITING);

      snap = (r1 as any).snapshot!;

      const r2 = await flowHandler.resume({
        nodes,
        edges,
        snapshot: snap,
        resolved: { nodeId: 'wait', output: { value: 'AVERAGE' } },
      });
      expect(r2.status).toBe(FlowExecutionStatus.WAITING);

      snap = (r2 as any).snapshot!;

      const r3 = await flowHandler.resume({
        nodes,
        edges,
        snapshot: snap,
        resolved: { nodeId: 'wait', output: { value: 'AVERAGE' } },
      });
      expect(r3.status).toBe(FlowExecutionStatus.COMPLETED);

      expect(outputService.getOutput('finalOutput')).toStrictEqual([
        'AVERAGE',
        'AVERAGE',
        'AVERAGE',
      ]);
    });

    it('should throw when resuming with bad snapshot', async () => {
      await expect(
        flowHandler.resume({
          nodes,
          edges,
          snapshot: { garbage: true } as any,
          resolved: { nodeId: 'wait', output: { value: 'SUM' } },
        })
      ).rejects.toThrow();
    });

    it('should report FAILED if an executor throws', async () => {
      class BrokenSum extends SumExecutor {
        async execute(): Promise<{ result: number }> {
          throw new Error('boom');
        }
      }
      const brokenHandler = getFlowHandler<NodeType>({
        executors: [
          new NumberArrayLoopExecutor(),
          new BrokenSum() as any,
          new ValueExecutor(),
          new GreaterThanNodeExecutor(),
          new WaitForeverExecutor(),
          new SaveOutputExecutor(outputService),
        ],
        enableLogger: false,
      });

      await expect(brokenHandler.execute({ nodes, edges })).rejects.toThrow('boom');
    });
  });
});
