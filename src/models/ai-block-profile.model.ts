import mongoose, { Schema } from 'mongoose';

// What the AI builder knows about a block, beyond the block itself: the
// real part it stands for and how its settings pick pins (for automatic
// wiring and the Hardware tab), whether it's in the kit, and tips for the
// builder. Written by an admin with "Teach the AI" (the AI proposes, the
// admin checks it). Blocks themselves are never changed.

export interface IAiPartWiring {
  kind: 'ports' | 'choice' | 'gpio' | 'pinList' | 'fixed' | 'i2c';
  binding?: string;
  bindings?: string[];
  map?: Record<string, string>;
  count?: number;
  names?: string[];
  role?: string;
  conn?: string;
  pins?: { name: string; gpio: number }[];
}

export interface IAiBlockProfile {
  blockType: string;
  // null: not a hardware part (logic, maths, comms...)
  part: { name: string; art: string; wirings: IAiPartWiring[] } | null;
  inKit: boolean;
  kitName: string;
  notes: string;
  // The block's updatedAt when it was taught: a block saved later makes the
  // profile outdated (the admin page shows it) until it is taught again
  blockVersion?: Date | null;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const AiBlockProfileSchema = new Schema<IAiBlockProfile>(
  {
    blockType: { type: String, required: true, unique: true, trim: true },
    part: { type: Schema.Types.Mixed, default: null },
    inKit: { type: Boolean, default: false },
    kitName: { type: String, trim: true, maxlength: 80, default: '' },
    notes: { type: String, trim: true, maxlength: 600, default: '' },
    blockVersion: { type: Date, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

export const AiBlockProfile = mongoose.model<IAiBlockProfile>('AiBlockProfile', AiBlockProfileSchema);
export default AiBlockProfile;
