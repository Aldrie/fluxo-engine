export class OutputServiceMock {
  private outputs = new Map();

  registerOutput(key: string, value: any) {
    this.outputs.set(key, [...(this.outputs.get(key) || []), value]);
  }

  getOutput<T>(key: string): T {
    return this.outputs.get(key) as T;
  }
}
