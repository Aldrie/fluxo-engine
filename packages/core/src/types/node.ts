import { UnknowEnum } from './core';
import { ValueTypes } from './enums/ValueTypes';
import { ConvertValuesToObject, Value } from './value';

export type Node<
  Type = UnknowEnum,
  Input extends Value<string, ValueTypes> = Value<string, ValueTypes>,
  Output extends Value<string, ValueTypes> = Value<string, ValueTypes>,
> = {
  id: string;
  isLoop?: boolean;
  type: Type;

  input: ConvertValuesToObject<Input>;
  output: ConvertValuesToObject<Output>;

  data?: Record<string, unknown>;

  defaultInput?: any;
};
