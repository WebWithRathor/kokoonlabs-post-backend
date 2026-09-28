import mongoose, { Schema } from 'mongoose';
import { CONTENT_MODEL_BY_TYPE, ISubmoduleContent } from '../interfaces/lms-content.interface';

const submoduleContentSchema = new Schema<ISubmoduleContent>(
  {
    submodule: { type: Schema.Types.ObjectId, ref: 'SubModule', required: [true, 'Submodule reference is required'] },
    module: { type: Schema.Types.ObjectId, ref: 'Module', required: [true, 'Module reference is required'] },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: [true, 'Course reference is required'] },
    contentType: { type: String, enum: ['video', 'note', 'mcq'], required: [true, 'Content type is required'] },
    contentId: { type: Schema.Types.ObjectId, required: [true, 'Content ID is required'], refPath: 'contentModel' },
    contentModel: { type: String, enum: ['Video', 'Note', 'MCQ'], required: [true, 'Content model is required'] },
    // Display order only; content can be completed in any order
    order: { type: Number, required: [true, 'Order is required'] },
    isActive: { type: Boolean, default: true },
    isNewContent: { type: Boolean, default: false }
  },
  { timestamps: true }
);

submoduleContentSchema.pre('validate', function () {
  if (this.contentType && this.contentModel !== CONTENT_MODEL_BY_TYPE[this.contentType]) {
    throw new Error(`contentModel must be ${CONTENT_MODEL_BY_TYPE[this.contentType]} for ${this.contentType}`);
  }
});

submoduleContentSchema.index({ submodule: 1, isActive: 1, order: 1 });
submoduleContentSchema.index({ submodule: 1, contentId: 1 }, { unique: true });
submoduleContentSchema.index({ course: 1, isActive: 1 });

export const SubmoduleContent = mongoose.model<ISubmoduleContent>('SubmoduleContent', submoduleContentSchema);
export default SubmoduleContent;
