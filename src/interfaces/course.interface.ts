import mongoose, { Document } from 'mongoose';

export interface IInstructor {
  id: string;
  name: string;
}

export enum CourseStateEnum {
  DRAFT = 'draft',
  COMING_SOON = 'coming_soon',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
  IN_REVIEW = 'in_review',
  STALE = 'stale'
}

export type CourseState = `${CourseStateEnum}`;

export type ICourseMode = 'online' | 'offline';

export interface ICourse extends Document {
  title: string;
  slug?: string;
  courseMode: ICourseMode;
  metaData: {
    description: string;
    difficulty?:
      | 'beginner'
      | 'intermediate'
      | 'advanced'
      | 'beginner-friendly'
      | 'beginner-to-advance';
    thumbnail?: string;
    iframe?: {
      src?: string;
      title?: string;
    };
    displayTags?: string[];
    requirements?: string[];
    courseHighlights?: {
      title: string;
      value: string;
    }[];
    certificate?: boolean;
    features?: {
      icon: string;
      count: string;
      title: string;
    }[];
    content?: {
      title: string;
      description: string;
      content: string[];
    }[];
    skill?: string[];
    kits?: {
      id?: mongoose.Types.ObjectId | string;
      name?: string;
    }[];
    faqs?: {
      que: string;
      ans: string;
    }[];
  };
  instructors?: IInstructor[];
  price?: number;
  order?: number;
  discount?: {
    type: 'fixed' | 'percentage';
    value: number;
  };
  state: CourseStateEnum;
  duration_weeks: number;
  type?: 'live' | 'self-paced';
  discord_access?: {
    channel_id?: string;
    role_id?: string;
    isDiscordEnabled?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ICourseDao {
  findAll(
    filter: Record<string, string | number | boolean>,
    sort: Record<string, 1 | -1>,
    skip: number | null,
    limit: number
  ): Promise<ICourse[]>;

  findById(id: string): Promise<ICourse | null>;

  findOne(
    filter: Record<string, string | number | boolean>
  ): Promise<ICourse | null>;

  create(data: Partial<ICourse>): Promise<ICourse>;

  update(id: string, data: Partial<ICourse>): Promise<ICourse | null>;

  delete(id: string): Promise<boolean>;

  count(filter: Record<string, string | number | boolean>): Promise<number>;

  validateCourse(data: Partial<ICourse>): string | null;

  findByIdWithSession(
    id: string,
    session: mongoose.ClientSession
  ): Promise<ICourse | null>;
}
