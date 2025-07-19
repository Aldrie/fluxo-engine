# **@fluxo-engine/core**

*A flexible, modular, fast, and lightweight workflow engine.*

Fluxo is a powerful framework for defining and executing workflows using a node‑and‑edge model. It supports custom behaviors (standard, loop, branch, wait), clear data mapping via handles, and full pause/resume capability—all with minimal overhead.

See on [GitHub](https://github.com/Aldrie/fluxo).

---

## **Features**

🧩 **Modular Execution** – Define custom executors for different node types.

🔗 **Edge‑Based Flow** – Nodes are connected via handles (`sourceValue`/`targetValue`) for precise data mapping.

🔄 **Loop Execution** – Execute sub‑flows over arrays, with automatic aggregation and caching.

🔀 **Branching Execution** – Conditionally route execution through true/false branches.

⏸ **Pause & Resume** – Halt at wait nodes, snapshot state, and resume later.

⚡️ **Lightweight & Fast** – Optimized for speed with minimal runtime overhead.

## **📦 Installation**

```bash
pnpm add @fluxo-engine/core
```


## **💡 Usage Examples**

### **🔧 1. Function‑Based Executors**

#### **Standard Node Execution**

```ts
import { NodeExecutor } from '@fluxo-engine/core';
import { NodeTypes } from './types';

const simpleExecutor: NodeExecutor<NodeTypes> = {
  type: NodeTypes.SIMPLE,
  async execute(input, data) {
    // Process the input and return output
    return { result: (input.num0 as number) + (input.num1 as number) };
  },
};
```

### **🏗️ 2. Class‑Based Executors**

You can also define executors as classes by implementing the respective interfaces.

#### **Standard Node Executor with a Class**

```ts
import { NodeExecutor } from '@fluxo-engine/core';
import { NodeTypes } from './types';

class SimpleNodeExecutor implements NodeExecutor<NodeTypes> {
  type = NodeTypes.SIMPLE;

  async execute(input: { num0: number; num1: number }, data: Record<string, unknown>) {
    // Execute node logic and return output
    return { result: input.num0 + input.num1 };
  }
}

// Instantiate and export the executor
export const simpleNodeExecutor = new SimpleNodeExecutor();
```

### **🔄 3. Loop Execution with Behavior**

> **Note:** The `LoopExecutor` iterates over an array and executes all nodes within its loop hierarchy for each iteration.

```ts
import { ExecutorBehavior, LoopNodeExecutor } from '@fluxo-engine/core';
import { NodeTypes } from './types';

class NumberArrayLoopExecutor implements LoopNodeExecutor<NodeTypes> {
  type = NodeTypes.NUMBER_ARRAY_LOOP;
  behavior = ExecutorBehavior.LOOP as const;

  async getArray(
    _input: any,
    data: { array: number[][] }
  ): Promise<{ [key: string]: number }[]> {
    const result = data.array.map((array) =>
      array.reduce(
        (acc, curr, index) => ({
          ...acc,
          [`num${index}`]: curr,
        }),
        {}
      )
    );

    console.log('result', result);
    return result;
  }
}

// Instantiate and export the executor
export const numberArrayLoopExecutor = new NumberArrayLoopExecutor();
```

### **🔀 4. Branch Execution with Behavior**

> **Note:** A **Branch Executor** allows for conditional execution, choosing different execution paths based on logic.

```ts
import { BranchExecutor, ExecutorBehavior } from '@fluxo-engine/core';
import { NodeType } from './types';

class GreaterThanNodeExecutor implements BranchExecutor<NodeType> {
  type = NodeType.GREATER_THAN;
  behavior = ExecutorBehavior.BRANCH as const;

  getTrueKey(): string {
    return 'isGreater';
  }

  getFalseKey(): string {
    return 'isNotGreater';
  }

  async executeBranch(input: { num0: number; num1: number }): Promise<boolean> {
    console.log('executing branch', input);
    return input.num0 > input.num1;
  }
}

// Instantiate and export the executor
export const greaterThanNodeExecutor = new GreaterThanNodeExecutor();
```

## **⏸ 5. Pause & Resume with Wait Executors**

Any executor can pause the flow by extending `WaitExecutor` and calling `this.stopExecution()`. Fluxo captures a snapshot of the entire execution state. Later, use `resume(...)` to continue from that exact point.

#### **Creating a Wait Executor**

```ts
import { WaitExecutor } from '@fluxo-engine/core';
import { NodeTypes } from './types';

export class WaitForeverExecutor extends WaitExecutor<NodeTypes> {
  type: NodeTypes.WAIT_FOREVER;

  async execute(_input: any, _data: any, resumeData: any) {
    // Pause the workflow here
    this.stopExecution();
    return {};
  }
}
```

#### **Running & Pausing**

```ts
import { getFlowHandler, FlowExecutionStatus } from '@fluxo-engine/core';

const handler = getFlowHandler({
  executors: [simpleNodeExecutor, numberArrayLoopExecutor, greaterThanNodeExecutor, new WaitForeverExecutor()],
  enableLogger: false,
});

const result = await handler.execute({ nodes, edges });

if (result.status === FlowExecutionStatus.WAITING) {
  const snapshot = result.snapshot;
  // store `snapshot` for later resumption
}
```

#### **Resuming**

```ts
await handler.resume({
  nodes,
  edges,
  snapshot,  
  resolved: [
    {
      nodeId: 'waitNodeId',            // the id of the wait‐node you’re resuming
      resumeData: {                    // whatever data your WaitExecutor needs to continue
        resolveExecution: true,
      },
      iterationContext: [],            // if it was inside a loop, put its iteration index here
    },
  ],
});
```

### **🔄➡️ 6. Defining and Executing a Flow**

A **flow** consists of nodes and edges defining the execution order. **Edges** now include `sourceValue` and `targetValue` (handles) to map outputs of one node to inputs of another.

#### **Example Flow:**

<img src="https://raw.githubusercontent.com/Aldrie/fluxo-engine/main/docs/example-flow.svg" alt="Example Flow" />

#### **Edge Mapping:**  
The edge will connect the `result` handle of the "sum" node to the `number` handle of the "number_to_string" node:

```ts
import { getFlowHandler } from '@fluxo-engine/core';
import { simpleNodeExecutor } from './SimpleNodeExecutor'; // class-based
import { numberArrayLoopExecutor } from './NumberArrayLoopExecutor'; // class-based
import { greaterThanNodeExecutor } from './GreaterThanNodeExecutor'; // branch-based

enum NodeTypes {
  SUM = 'sum',
  NUMBER_TO_STRING = 'number_to_string',
  GREATER_THAN = 'greater_than',
};

// Define flow handler with your executors (you can mix function-based and class-based)
const flowHandler = getFlowHandler({
  executors: [simpleNodeExecutor, numberArrayLoopExecutor, greaterThanNodeExecutor],
  enableLogger: false,
});

// Define nodes
const nodes = [
  {
    id: 'sum',
    type: NodeTypes.SUM,
    input: { num0: 5, num1: 7 },
    output: {},
  },
  {
    id: 'greater_than_check',
    type: NodeTypes.GREATER_THAN,
    input: { num0: 10, num1: 7 },
    output: {},
  },
  {
    id: 'number_to_string',
    type: NodeTypes.NUMBER_TO_STRING,
    input: { number: null }, // value will be set via edge mapping
    output: {},
  },
];

// Define edges with handles mapping
const edges = [
  {
    source: 'sum',
    target: 'number_to_string',
    sourceValue: 'result',   // the output handle from the "sum" node
    targetValue: 'number',   // the input handle of the "number_to_string" node
  },
  {
    source: 'greater_than_check',
    target: 'sum',
    sourceValue: 'isGreater', // Branch executor output (true case)
    targetValue: 'num0',      // Becomes the new input of "sum"
  },
];

// Execute the flow
await flowHandler.execute({ nodes, edges });
```

## **🚀 Why Use Fluxo?**

* **Flexible:** Easily define any node behavior via custom executors.
* **Efficient:** Minimal overhead ensures fast execution of workflows.
* **Scalable:** Handles both simple and complex workflow scenarios.
* **Precise Data Mapping:** Explicit handles prevent ambiguity across nodes.
* **Advanced Flows:** Native support for looping, branching, and pause/resume.

<img src="https://media.tenor.com/sbfBfp3FeY8AAAAj/oia-uia.gif" width="100" alt="Fluxo Animation" />
