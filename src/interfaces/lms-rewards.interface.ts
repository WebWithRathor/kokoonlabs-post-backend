import { Document, Types } from 'mongoose';

export interface ISkill extends Document {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type BadgeRuleType =
  | 'total_xp'
  | 'streak_days'
  | 'projects_approved'
  | 'courses_completed'
  | 'challenges_completed'
  | 'early_finishes';

export interface IBadge extends Document {
  name: string;
  description?: string;
  icon: string;
  ruleType: BadgeRuleType;
  threshold: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ChallengeType = 'global' | 'course';

export interface IChallenge extends Document {
  type: ChallengeType;
  title: string;
  description: string;
  instructions?: string;
  maxXp: number;
  maxResubmissions: number;
  skill: Types.ObjectId | null;
  requiredLevel: number | null;
  course: Types.ObjectId | null;
  unlockAfterSubModule: Types.ObjectId | null;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

// Frozen copy of the block-editor project at submit time, so mentors review
// exactly what was submitted even if the student keeps editing the project.
export interface IProjectSnapshot {
  title: string;
  nodes: unknown[];
  edges: unknown[];
  code: string;
}

export interface ISubmission extends Document {
  challenge: Types.ObjectId;
  user: Types.ObjectId;
  challengeType: ChallengeType;
  course: Types.ObjectId | null;
  attemptNo: number;
  project: Types.ObjectId;         // Project (block editor)
  projectSnapshot: IProjectSnapshot;
  videoUrl: string;                // Pixxo URL
  status: SubmissionStatus;
  score: number | null;
  xpAwarded: number;
  feedback?: string;
  reviewedBy: Types.ObjectId | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CertificateType = 'progress' | 'excellence';

export interface ICertificate extends Document {
  user: Types.ObjectId;
  course: Types.ObjectId;
  batch?: Types.ObjectId;
  type: CertificateType;
  certificateId: string;
  issueDate: Date;
  progress: number;
  xpPercent: number | null;
  fileUrl?: string;
  metadata: {
    userName: string;
    courseName: string;
    batchName?: string;
    instructorName?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationType =
  | 'streak_reminder'
  | 'challenge_unlocked'
  | 'new_global_challenge'
  | 'project_reviewed'
  | 'level_up'
  | 'badge_earned';

export type EmailStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface INotification extends Document {
  user: Types.ObjectId;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
  readAt: Date | null;
  emailStatus: EmailStatus;
  emailSentAt?: Date;
  emailClaimedAt?: Date;
  emailError?: string;
  createdAt: Date;
}
