import { Request, Response, NextFunction } from 'express';

export const parseQueryParams = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    // 1. Parse Pagination (supports both page, per_page and limit)
    const rawPage = parseInt(req.query.page as string, 10);
    const rawLimit = parseInt(
      (req.query.per_page || req.query.perPage || req.query.limit) as string,
      10
    );

    const page = !isNaN(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit =
      !isNaN(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
    const skip = (page - 1) * limit;

    req.pagination = { page, limit, skip };

    // 2. Parse Sorting
    const sortObj: Record<string, 1 | -1> = {};
    if (req.query.sort && typeof req.query.sort === 'string') {
      const fields = req.query.sort.split(',');
      fields.forEach((field) => {
        const trimmed = field.trim();
        if (trimmed.startsWith('-')) {
          sortObj[trimmed.substring(1)] = -1;
        } else if (trimmed) {
          sortObj[trimmed.replace(/^\+/, '')] = 1;
        }
      });
    } else {
      sortObj.createdAt = -1;
    }
    req.sortOptions = sortObj;

    // 3. Parse Filtering
    const filterObj: Record<string, any> = {};

    if (req.query.status) {
      filterObj.status = req.query.status;
    }
    if (req.query.role) {
      filterObj.role = req.query.role;
    }
    if (req.query.courseMode) {
      filterObj.courseMode = req.query.courseMode;
    }
    if (req.query.difficulty) {
      filterObj.difficulty = req.query.difficulty;
    }
    if (req.query.difficultyLevel) {
      filterObj.difficultyLevel = req.query.difficultyLevel;
    }
    if (req.query.type) {
      filterObj.type = req.query.type;
    }
    if (req.query.category) {
      filterObj.category = req.query.category;
    }
    if (req.query.shape) {
      filterObj.shape = req.query.shape;
    }
    if (req.query.age) {
      const parsedAge = parseInt(req.query.age as string, 10);
      if (!isNaN(parsedAge)) {
        filterObj.age = parsedAge;
      }
    }
    if (req.query.search) {
      const searchStr = String(req.query.search).trim();
      if (searchStr) {
        filterObj.search = searchStr;
      }
    }

    // 4. Set Combined dbQuery object
    req.dbQuery = {
      filter: filterObj,
      sort: sortObj,
      fields: req.query.fields as string | string[] | undefined
    };

    next();
  } catch (error) {
    next(error);
  }
};
