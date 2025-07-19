export function mapToObject<K extends string, V>(map: Map<K, V>): Record<K, V> {
  return Object.fromEntries(map) as Record<K, V>;
}

export function objectToMap<K extends string, V>(obj: Record<K, V>): Map<K, V> {
  return new Map(Object.entries(obj)) as Map<K, V>;
}
