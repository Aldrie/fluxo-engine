import { ValueTypes } from './enums/ValueTypes';

export type Value<K extends string, T = ValueTypes> = Record<K, T>;

export type ConvertValueType<T> = T extends ValueTypes.STRING
  ? string
  : T extends ValueTypes.NUMBER
    ? number
    : T extends ValueTypes.BOOLEAN
      ? boolean
      : T extends ValueTypes.ARRAY
        ? unknown[]
        : T extends ValueTypes.OBJECT
          ? Record<string, unknown>
          : T extends ValueTypes.OBJECT_ARRAY
            ? Record<string, unknown>[]
            : never;

export type ConvertValuesToObject<T> = {
  [K in keyof T]: T[K] extends ValueTypes
    ? ConvertValueType<T[K]>
    : T[K] extends object
      ? ConvertValuesToObject<T[K]>
      : T[K];
};
