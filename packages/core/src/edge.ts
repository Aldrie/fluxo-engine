import { BranchEdge, Edge } from './types/edge';

export function isBranchEdge(edge: Edge): edge is BranchEdge {
  const branchEdge = edge as BranchEdge;
  return branchEdge?.branch !== null && branchEdge?.branch !== undefined;
}
