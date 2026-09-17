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
    }
  },
  {
    timestamps: true,
    minimize: false
  }
);

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
export default Project;
