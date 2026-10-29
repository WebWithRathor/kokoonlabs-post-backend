import mongoose, { Schema } from 'mongoose';
import { IProject } from '../interfaces/project.interface';

const ProjectSchema = new Schema<IProject>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'Untitled Project'
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    nodes: {
      type: [Schema.Types.Mixed] as any,
      default: []
    },
    edges: {
      type: [Schema.Types.Mixed] as any,
      default: []
    },
    code: {
      type: String,
      default: ''
    },
    activeNodesCount: {
      type: Number,
      default: 0
    },
    // The Bluetooth page layout (see IBtPageLayout), null without a Bluetooth block
    btLayout: {
      type: Schema.Types.Mixed,
      default: null
    },
    // Public link code for the Bluetooth page (/bt/<code>); absent until needed
    btCode: {
      type: String
    }
  },
  {
    timestamps: true,
    minimize: false
  }
);

// Each code belongs to one project. Partial: projects without a code don't count.
ProjectSchema.index({ btCode: 1 }, { unique: true, partialFilterExpression: { btCode: { $type: 'string' } } });

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
export default Project;
