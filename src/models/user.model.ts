import mongoose, { Model, Schema } from 'mongoose';
import { IUser, UserRole } from '../interfaces';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import bcrypt from 'bcryptjs';

const userSchema: Schema<IUser> = new Schema(
  {
    name: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, trim: true }
    },
    phone: {
      code: { type: String, trim: true },
      number: { type: String, trim: true, index: true, sparse: true }
    },
    password: {
      type: String,
      select: false
    },
    
    email: { type: String, trim: true, lowercase: true, index: true, sparse: true },
    googleId: { type: String, index: true, sparse: true },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    DOB: { type: Date },
    city: { type: String },
    state: { type: String },
    age: { type: Number },
    collegeName: { type: String },
    pincode: { type: String },
    xp: { type: Number, default: 0 },
    
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.STUDENT
    },
    coins: { type: Number, default: 0 },

    aiQuestionsAskedToday: { type: Number, default: 0 },
    aiQuotaResetAt: { type: Date },

    refreshToken: {
      type: String,
      select: false
    },

    deviceInfo: {
      userAgent: {
        type: String,
        default: ''
      },
      ipAddress: {
        type: String,
        default: ''
      }
    },

    profilePicture: {
      type: String,
      default: function (this: IUser) {
        return `https://api.dicebear.com/10.x/lorelei/svg?seed=${this.email}&size=100`;
      }
    },

    isActive: {
      type: Boolean,
      default: false
    },
    
    lastActivity: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Pre-save hook to hash password if modified
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) {
    return;
  }
  this.password = await bcrypt.hash(this.password, 10);
});

// Instance method to compare password
userSchema.methods.comparePassword = async function (
  enteredPassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// Sign a JWT access token for the User document
userSchema.methods.signAccessToken = function (this: IUser): string {
  return jwt.sign(
    {
      _id: this._id,
      role: this.role
    },
    config.jwtAccessSecret,
    {
      expiresIn: config.jwtAccessExpiresIn
    } as jwt.SignOptions
  );
};

// Sign a JWT refresh token for the User document
userSchema.methods.signRefreshToken = function (this: IUser): string {
  return jwt.sign(
    {
      _id: this._id
    },
    config.jwtRefreshSecret,
    {
      expiresIn: config.jwtRefreshExpiresIn
    } as jwt.SignOptions
  );
};

// Compare a JWT refresh token for the User document
userSchema.methods.compareRefreshToken = async function (
  incomingToken: string
): Promise<boolean> {
  return await bcrypt.compare(incomingToken, this.refreshToken as string);
};

export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
export default User;
