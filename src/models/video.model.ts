import mongoose, { Schema } from 'mongoose';
import { IVideo } from '../interfaces/lms-content.interface';

const videoSchema = new Schema<IVideo>(
  {
    title: { type: String, required: [true, 'Video title is required'], trim: true },
    description: { type: String, required: [true, 'Video description is required'] },
    videoId: { type: String, required: [true, 'Video ID is required'], unique: true },
    provider: { type: String, default: 'vdocipher' },
    // Required: completes at 70% of unique seconds watched
    duration: { type: Number, required: [true, 'Video duration (seconds) is required'], min: [1, 'Duration must be at least 1 second'] },
    points: { type: Number, required: [true, 'Points are required'], min: [0, 'Points cannot be negative'], default: 1 },
    links: {
      type: [{ _id: false, name: { type: String, required: true, trim: true }, url: { type: String, required: true, trim: true } }],
      default: []
    },
    tags: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
    classId: { type: String, default: null, trim: true }
  },
  { timestamps: true }
);

videoSchema.index({ tags: 1 });

export const Video = mongoose.model<IVideo>('Video', videoSchema);
export default Video;
