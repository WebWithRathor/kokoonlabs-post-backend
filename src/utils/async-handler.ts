import { NextFunction, Request, Response } from "express";

const asyncHandler = (
  requestHandler: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<void | object | string> | void,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return Promise.resolve(requestHandler(req, res, next)).catch((err) =>
      next(err),
    );
  };
};

export default asyncHandler;
