import mongoose, { Document } from 'mongoose';

export interface IKitEquipment {
  id: mongoose.Types.ObjectId | string;
  count: number;
}

export interface IKit extends Document {
  slug: string;
  title: string;
  description: string;
  images: string[];
  isActive: boolean;
  skills: string[];
  equipments: IKitEquipment[];
  createdAt: Date;
  updatedAt: Date;
}
