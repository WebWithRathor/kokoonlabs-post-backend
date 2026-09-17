import { Document, ObjectId } from 'mongoose';

export interface IUserName {
  firstName: string;
  lastName?: string;
}

export interface IDeviceInfo {
  userAgent?: string;
  ipAddress?: string;
}

export interface IPhone {
  code?: string;
  number?: string;
}

export type Gender = 'male' | 'female' | 'other';

export interface IUser extends Document {
  name: IUserName;
  password?: string;
  phone?: IPhone;
  googleId?: string;
  DOB?: Date;
  xp?: number;
  email?: string;
  profilePicture?: string;
  isActive: boolean;
  deviceInfo: IDeviceInfo;
  lastActivity?: Date;
  role: UserRole;
  gender?: Gender;
  coins?: number;
  aiQuestionsAskedToday?: number;
  aiQuotaResetAt?: Date;
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
  city?: string;
  state?: string;
  age?: number;
  collegeName?: string;
  pincode?: string;
  signAccessToken: () => string;
  signRefreshToken: () => string;
  compareRefreshToken: (incomingRefreshToken: string) => Promise<boolean>;
  comparePassword: (enteredPassword: string) => Promise<boolean>;
}

export interface IUserProfileUpdate {
  name?: IUserName;
  DOB?: Date;
  city?: string;
  state?: string;
  age?: number;
  gender?: Gender;
  collegeName?: string;
  pincode?: string;
}

export enum UserRole {
  BLOCKED = 'blocked',
  DELETED = 'deleted',
  STUDENT = 'student',
  SALES_COUNSELLER = 'sales_counsellor',
  MENTOR = 'mentor',
  BATCHMANAGER = 'batch_manager',
  SUPPORT = 'support',
  SALESANDMARKETING = 'sales_and_marketing',
  INSTRUCTOR = 'instructor',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin'
}

export const RoleHierarchy = {
  [UserRole.BLOCKED]: -2,
  [UserRole.DELETED]: -1,
  [UserRole.STUDENT]: 1,
  [UserRole.SALES_COUNSELLER]: 2,
  [UserRole.MENTOR]: 3,
  [UserRole.BATCHMANAGER]: 4,
  [UserRole.SUPPORT]: 5,
  [UserRole.SALESANDMARKETING]: 6,
  [UserRole.INSTRUCTOR]: 7,
  [UserRole.ADMIN]: 8,
  [UserRole.SUPER_ADMIN]: 9
} as const;

export interface course {
  title: string;
  description: string;
  coursePrice: number;
  dicount: {
    type: 'fixed' | 'percentage';
    value: number;
  };
  thumbnail: string;
  isFree: boolean;
  iframe: string;
  content: [
    {
      title: string;
      sections: [string];
    }
  ];
  courseStatus: '';
  isActive: boolean;
}
