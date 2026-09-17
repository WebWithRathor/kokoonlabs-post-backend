import mongoose, { Schema } from 'mongoose';
import { IErrorLog } from '../interfaces/error-log.interface';

const ErrorLogSchema = new Schema<IErrorLog>(
  {
    message: {
      type: String,
      required: true
    },
    stack: {
      type: String,
      required: true
    },
    statusCode: {
      type: Number,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    method: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    requestBody: {
      type: Schema.Types.Mixed
    },
    requestParams: {
      type: Schema.Types.Mixed
    },
    requestQuery: {
      type: Schema.Types.Mixed
    },
    userAgent: {
      type: String
    },
    ip: {
      type: String
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<IErrorLog>('ErrorLog', ErrorLogSchema);
