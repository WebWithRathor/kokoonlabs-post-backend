import mongoose, { Document } from 'mongoose';

export interface IErrorLog extends Document {
  message: string;
  stack: string;
  statusCode: number;
  url: string;
  method: string;
  timestamp: Date;
  requestBody?: any;
  requestParams?: any;
  requestQuery?: any;
  userAgent?: string;
  ip?: string;
  user?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IErrorLogDao {
  create(data: Partial<IErrorLog>): Promise<IErrorLog>;
  findById(id: string): Promise<IErrorLog | null>;
  findAll(
    filter: Record<string, string | number | boolean | object> | object,
    sort: Record<string, 1 | -1>,
    skip: number,
    limit: number
  ): Promise<IErrorLog[]>;
  findOne(
    filter: Record<string, string | number | boolean | object> | object
  ): Promise<IErrorLog | null>;
  update(id: string, data: Partial<IErrorLog>): Promise<IErrorLog | null>;
  delete(id: string): Promise<IErrorLog | null>;
  count(
    filter: Record<string, string | number | boolean | object> | object
  ): Promise<number>;
  deleteMany(
    filter: Record<string, string | number | boolean | object> | object
  ): Promise<number>;
}
