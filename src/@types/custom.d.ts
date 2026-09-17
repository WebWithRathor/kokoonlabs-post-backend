import { IUser } from '../interfaces/user.interface';

declare global {
  namespace Express {
    interface Request {
      user?: IUser | null;
      pagination?: {
        page: number;
        limit: number;
        skip: number;
      };
      dbQuery?: {
        filter: Record<string, any>;
        sort: Record<string, 1 | -1>;
        fields?: string | string[];
      };
      sortOptions?: {
        [key: string]: 1 | -1;
      };
      select?: string | string[];
      populate?: string | string[];
      fields?: string;
    }
  }
}
export {};
