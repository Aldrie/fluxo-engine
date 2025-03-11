type Common = {
  source: string;
  target: string;
}

export type BaseEdge = Common & {
  sourceValue?: string;
  targetValue?: string;
};

export type BranchEdge = BaseEdge & {
  branch: string;
};

export type Edge = BaseEdge | BranchEdge;
