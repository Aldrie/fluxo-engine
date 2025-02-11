import { Node } from './node';
import { ConvertValuesToObject } from './value';

type MapTypes = Pick<Node, 'inputMap' | 'outputMap'>;

interface BaseExecutor<Enum extends UnknowEnum> extends MapTypes {
  type: Enum;
}

export interface LoopNodeExecutor<Enum extends UnknowEnum> extends BaseExecutor<Enum> {
  isLoopExecutor: true;
  getArray(
    input: ConvertValuesToObject<MapTypes['inputMap']>,
    data: ConvertValuesToObject<Node['data']>,
    iteration?: number
  ): Promise<
    ConvertValuesToObject<MapTypes['outputMap'] | ConvertValuesToObject<MapTypes['outputMap']>[]>
  >;
}

export interface NodeExecutor<Enum extends UnknowEnum> extends BaseExecutor<Enum> {
  isLoopExecutor?: false;
  execute(
    input: ConvertValuesToObject<MapTypes['inputMap']>,
    data: ConvertValuesToObject<Node['data']>,
    iteration?: number
  ): Promise<ConvertValuesToObject<MapTypes['outputMap']>>;
}

export type Executor<Enum extends UnknowEnum> = LoopNodeExecutor<Enum> | NodeExecutor<Enum>;
