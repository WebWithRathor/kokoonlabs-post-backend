import { Document, Types } from 'mongoose';

// A function a student built from blocks in the editor, saved to their
// library. Published ones (after an admin approves) show for everyone.
export type FunctionBlockStatus = 'private' | 'pending' | 'published' | 'rejected';

export interface IFunctionBlockGraph {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
}

export interface IFunctionBlockFork {
  id: Types.ObjectId;
  title: string;
  authorName: string;
}

export interface IFunctionBlock extends Document {
  owner: Types.ObjectId;
  authorName: string;
  name: string; // Python identifier used in the code
  title: string; // shown in the block list
  description: string;
  params: string[];
  isAsync: boolean;
  returnValue: string;
  graph: IFunctionBlockGraph; // the function block and every block inside it
  code: string; // generated Python, for previews and review
  status: FunctionBlockStatus;
  submittedAt: Date | null;
  reviewNote: string;
  reviewedBy: Types.ObjectId | null;
  reviewedAt: Date | null;
  forkedFrom: IFunctionBlockFork | null;
  createdAt: Date;
  updatedAt: Date;
}
