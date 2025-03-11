export class OutputServiceMock {
  private outputs = new Map();

  registerOutput(key: string, value: any) {
    this.outputs.set(key, value);
  }

  getOutput<T>(key: string): T {
    console.log(this.outputs)
    return this.outputs.get(key) as T;
  }
}
