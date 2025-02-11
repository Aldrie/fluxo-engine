interface Options {
  enabled?: boolean;
}

export default function getLogger({ enabled }: Options) {
  return function logger(...params: Parameters<typeof console.log>) {
    if (enabled) return console.log(params);
  };
}
