import { BranchEdge, Edge } from './types/edge';

export function isBranchEdge(edge: Edge): edge is BranchEdge {
  return 'branch' in edge;
}
