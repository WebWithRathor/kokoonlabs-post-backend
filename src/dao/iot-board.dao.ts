import mongoose from 'mongoose';
import IotBoardModel from '../models/iot-board.model';
import { IIotBoard } from '../interfaces/iot-board.interface';

// Every lookup is by owner: a student only ever sees and uses their own boards.
export class IotBoardDao {
  async create(data: Partial<IIotBoard>): Promise<IIotBoard> {
    return await IotBoardModel.create(data);
  }

  async listForUser(userId: string): Promise<IIotBoard[]> {
    return await IotBoardModel.find({ userId }).sort({ createdAt: 1 }).exec();
  }

  async countForUser(userId: string): Promise<number> {
    return await IotBoardModel.countDocuments({ userId }).exec();
  }

  async findForUser(userId: string, id: string, withCredentials = false): Promise<IIotBoard | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const query = IotBoardModel.findOne({ _id: id, userId });
    return await (withCredentials ? query.select('+credentials') : query).exec();
  }

  async updateForUser(userId: string, id: string, set: Partial<IIotBoard>): Promise<IIotBoard | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await IotBoardModel.findOneAndUpdate({ _id: id, userId }, { $set: set }, { new: true }).exec();
  }

  async deleteForUser(userId: string, id: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(id)) return false;
    const res = await IotBoardModel.deleteOne({ _id: id, userId }).exec();
    return res.deletedCount === 1;
  }
}

export const iotBoardDao = new IotBoardDao();
export default iotBoardDao;
