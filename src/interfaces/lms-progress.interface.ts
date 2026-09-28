import { Document, Types } from 'mongoose';
import { ContentModelName, ContentType } from './lms-content.interface';

export interface IModuleProgress {
  module: Types.ObjectId;
  unlockedAt: Date;
  completedAt: Date | null;
  xpAwarded: number;
}

export interface ISubModuleProgress {
  subModule: Types.ObjectId;
  module: Types.ObjectId;
  unlockedAt: Date;
  deadlineAt: Date | null;     // frozen at unlock
  completedAt: Date | null;
  xpAwarded: number;           // SUB_MODULE_COMPLETE + bonus
  bonusXp: number;             // 0 / 10 / 20 / 30
}

export interface IContentItemProgress {
  contentType: ContentType;
  contentId: Types.ObjectId;
  contentModel: ContentModelName;
  subModuleId: Types.ObjectId;
  completed: boolean;
  completedAt?: Date;
  pointsEarned: number;        // progress points: the item's full points once done
  xpAwarded: number;
  watchedDuration?: number;
  watchedIntervals?: [number, number][];
  lastPositionSeconds?: number;
  selectedOptions?: number[];
  attempts: number;
  bestScore?: number;          // 0..1
}

export interface IUserProgress extends Document {
  user: Types.ObjectId;
  course: Types.ObjectId;
  overallProgress: number;     // 0..100
  totalPointsEarned: number;
  xpEarned: number;            // all XP from this course
  bonusXpEarned: number;       // early-finish bonus only
  moduleProgress: IModuleProgress[];
  subModuleProgress: ISubModuleProgress[];
  contentItemProgress: IContentItemProgress[];
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStreakDay {
  date: string;                // 'YYYY-MM-DD' IST
  itemsCompleted: number;
}

export interface IUserStreak extends Document {
  user: Types.ObjectId;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  streakHistory: IStreakDay[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserSkillLevel {
  skill: Types.ObjectId;
  level: number;
}

export interface IUserBadge {
  badge: Types.ObjectId;
  awardedAt: Date;
}

export interface IUserStats extends Document {
  user: Types.ObjectId;
  totalXp: number;
  level: number;
  earlyFinishes: number;
  skills: IUserSkillLevel[];
  badges: IUserBadge[];
  createdAt: Date;
  updatedAt: Date;
}
