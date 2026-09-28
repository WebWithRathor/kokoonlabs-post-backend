import mongoose, { Schema } from 'mongoose';
import { IBlock, IBlockField } from '../interfaces/block.interface';

const FieldSchema = new Schema<IBlockField>(
  {
    name: { type: String, required: true },
    kind: {
      type: String,
      enum: ['dropdown', 'number', 'text'],
      default: 'text'
    },
    options: { type: [[String]], default: [] },
    default: { type: String, default: '' }
  },
  { _id: false }
);

const BlockSchema = new Schema<IBlock>(
  {
    type: { type: String, required: true, unique: true },
    label: { type: String },
    fields: { type: [FieldSchema], default: [] },
    template: { type: String },
    title: { type: String },
    // Short "what does this block do" text shown to students in the editor
    description: { type: String, trim: true, maxlength: 300, default: '' },
    icon: { type: String },
    sections: { type: Schema.Types.Mixed },
    outputs: { type: [Schema.Types.Mixed], default: [] },
    codegen: { type: String },
    declaration: { type: String, default: '' },
    category: { type: String, default: 'General' },
    colour: { type: String, default: '#1D9E75' },
    imports: { type: [String], default: [] },
    shape: {
      type: String,
      enum: ['statement', 'value', 'hat'],
      default: 'statement'
    },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' }
  },
  { timestamps: true, minimize: false }
);

export const Block = mongoose.model<IBlock>('Block', BlockSchema);
export default Block;
