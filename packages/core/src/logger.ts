let enabled = false;

export default function getLogger(title?: string) {
  return function logger(...params: Parameters<typeof console.log>) {
    if (enabled) return console.log(...[title ? [title] : [], ...params]);
  };
}

export function setIsLoggerEnabled(value: boolean) {
  enabled = value;
}
