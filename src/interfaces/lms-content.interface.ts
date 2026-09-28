import { Document, Model, Types } from 'mongoose';

// ---------------------------------------------------------------------
// Course structure: Course (pre side) -> Module -> SubModule -> content
// ---------------------------------------------------------------------
export interface IModule extends Document {
  title: string;
  description: string;
  course: Types.ObjectId;
  order: number;
  isActive: boolean;
  totalPoints: number;   // progress points: sum of its sub-modules' points
  maxBonusXp: number;    // sum of its sub-modules' maxBonusXp
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubModuleSkill {
  skill: Types.ObjectId;
  level: number;
}

export interface ISubModule extends Document {
  title: string;
  description: string;
  module: Types.ObjectId;
  course: Types.ObjectId;
  order: number;
  points: number;              // progress points: sum of its content's points
  isActive: boolean;
  deadlineDays: number | null; // counted from the module's unlock; null = no bonus
  maxBonusXp: number;          // 0 / 10 / 20 / 30, derived from deadlineDays
  skills: ISubModuleSkill[];
  createdAt: Date;
  updatedAt: Date;
}
export type ISubModuleModel = Model<ISubModule>;

export type ContentType = 'video' | 'note' | 'mcq';
export type ContentModelName = 'Video' | 'Note' | 'MCQ';
export const CONTENT_MODEL_BY_TYPE: Record<ContentType, ContentModelName> = {
  video: 'Video',
  note: 'Note',
  mcq: 'MCQ'
};

export interface ISubmoduleContent extends Document {
  submodule: Types.ObjectId;
  module: Types.ObjectId;
  course: Types.ObjectId;
  contentType: ContentType;
  contentId: Types.ObjectId;
  contentModel: ContentModelName;
  order: number;
  isActive: boolean;
  isNewContent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IVideo extends Document {
  title: string;
  description: string;
  videoId: string;
  provider: string;
  duration: number;       // seconds; auto-complete at 70% watched
  points: number;
  links: { name: string; url: string }[];
  tags: string[];
  isActive: boolean;
  classId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface INote extends Document {
  title: string;
  content: string;        // URL of the note
  description?: string;
  images: string[];
  points: number;
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMcqOption {
  text: string;
  isCorrect: boolean;
}

export interface IMCQ extends Document {
  title: string;
  question: string;
  image?: string;
  codeSnippets: { language: string; code: string }[];
  options: IMcqOption[];
  selectionType: 'single' | 'multiple';
  maxAttempts: number;
  points: number;
  explanation?: { text?: string; video?: string; image?: string };
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
