import mongoose, { Schema } from 'mongoose';
import { IIotBoard } from '../interfaces/iot-board.interface';
import { IOT_BOARDS, HARDWARE_ID_RE } from '../utils/iot-studio';

const sealedSchema = new Schema({ iv: String, tag: String, data: String }, { _id: false });
const programSchema = new Schema({ programId: String, name: String, version: String }, { _id: false });

const IotBoardSchema = new Schema<IIotBoard>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    board: { type: String, required: true, enum: IOT_BOARDS },
    hardwareId: { type: String, required: true, match: HARDWARE_ID_RE, immutable: true },
    deviceId: { type: String, default: null },
    studioUrl: { type: String, default: null },
    // Never returned by default: only the flash route reads it
    credentials: { type: sealedSchema, default: null, select: false },
    lastProgram: { type: programSchema, default: null },
    lastVariables: { type: [Schema.Types.Mixed] as any, default: [] },
    lastFlashedAt: { type: Date, default: null }
  },
  { timestamps: true, minimize: false }
);

// One physical board, one id, across all students
IotBoardSchema.index({ hardwareId: 1 }, { unique: true });

export const IotBoard = mongoose.model<IIotBoard>('IotBoard', IotBoardSchema);
export default IotBoard;
