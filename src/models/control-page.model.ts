import mongoose, { Schema } from 'mongoose';
import { CONTROL_PAGE_KINDS, IControlPage } from '../interfaces/control-page.interface';

const ControlPageSchema = new Schema<IControlPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    kind: { type: String, enum: CONTROL_PAGE_KINDS, required: true },
    // The page as the editor edits it (checked by utils/control-page)
    layout: { type: Schema.Types.Mixed, required: true },
    // The project it's connected to (null: none). One page per project and kind.
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null }
  },
  { timestamps: true, minimize: false }
);

ControlPageSchema.index({ userId: 1, updatedAt: -1 });
ControlPageSchema.index({ userId: 1, projectId: 1, kind: 1 });

export const ControlPage = mongoose.model<IControlPage>('ControlPage', ControlPageSchema);
export default ControlPage;
