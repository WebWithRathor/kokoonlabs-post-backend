import mongoose, { Schema } from 'mongoose';
import { IFunctionBlock } from '../interfaces/function-block.interface';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// "Modified from <title> by <author>"
const forkSchema = new Schema(
  { id: { type: Schema.Types.ObjectId, ref: 'FunctionBlock' }, title: String, authorName: String },
  { _id: false }
);

const functionBlockSchema = new Schema<IFunctionBlock>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, trim: true, default: 'Student' },
    name: {
      type: String,
      required: [true, 'Function name is required'],
      trim: true,
      maxlength: 60,
      match: [IDENTIFIER, 'Function name: letters, numbers and _ only, not starting with a number']
    },
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    params: {
      type: [{ type: String, trim: true, match: [IDENTIFIER, 'Invalid input name'] }],
      default: [],
      validate: [(v: string[]) => v.length <= 10, 'At most 10 inputs']
    },
    isAsync: { type: Boolean, default: false },
    returnValue: { type: String, trim: true, maxlength: 200, default: '' },
    graph: {
      nodes: { type: [Schema.Types.Mixed], default: [] },
      edges: { type: [Schema.Types.Mixed], default: [] }
    },
    code: { type: String, default: '', maxlength: 50000 },
    status: { type: String, enum: ['private', 'pending', 'published', 'rejected'], default: 'private' },
    submittedAt: { type: Date, default: null },
    reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    forkedFrom: { type: forkSchema, default: null }
  },
  { timestamps: true, minimize: false }
);

functionBlockSchema.index({ owner: 1, updatedAt: -1 });
functionBlockSchema.index({ status: 1, updatedAt: -1 });
functionBlockSchema.index({ status: 1, submittedAt: 1 }, { partialFilterExpression: { status: 'pending' } });

export const FunctionBlock = mongoose.model<IFunctionBlock>('FunctionBlock', functionBlockSchema);
export default FunctionBlock;
