import { ValueTypes } from './enums/ValueTypes';
import { ConvertValuesToObject, Value } from './value';

export type UnknowEnum = Record<string, string | number>;
export type ExecutedNodeOutputs = Map<string, ConvertValuesToObject<Value<string, ValueTypes>>>;
