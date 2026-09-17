import Address from '../models/address.model';
import { IAddress } from '../interfaces/address.interface';

export class AddressDao {
  async create(addressData: Partial<IAddress>): Promise<IAddress> {
    const addressId = 'addr_' + Math.random().toString(36).substring(2, 12);
    return (await Address.create({ addressId, ...addressData })) as IAddress;
  }

  async findByUserId(userId: string): Promise<IAddress[]> {
    return await Address.find({ userId }).sort({ createdAt: -1 });
  }

  async findByIdAndUserId(addressId: string, userId: string): Promise<IAddress | null> {
    return (await Address.findOne({ addressId, userId })) as IAddress | null;
  }

  async update(addressId: string, userId: string, updateData: Partial<IAddress>): Promise<IAddress | null> {
    return (await Address.findOneAndUpdate(
      { addressId, userId },
      { $set: updateData },
      { new: true }
    )) as IAddress | null;
  }

  async delete(addressId: string, userId: string): Promise<boolean> {
    const res = await Address.deleteOne({ addressId, userId });
    return res.deletedCount > 0;
  }
}

export const addressDao = new AddressDao();
export default addressDao;
