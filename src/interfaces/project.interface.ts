import mongoose, { Document } from 'mongoose';

export interface IProject extends Document {
  title: string;
  description?: string;
  userId: mongoose.Types.ObjectId | string;
  nodes: unknown[];
  edges: unknown[];
  code: string;
  activeNodesCount: number;
  createdAt: Date;
  updatedAt: Date;
}
