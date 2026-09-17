import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ValidationChain, validationResult } from 'express-validator';
import ResponseHandler from './response-handler';

export const validateChain = (
  validations: ValidationChain[]
): RequestHandler[] => {
  return [
    ...validations,
    (req: Request, res: Response, next: NextFunction) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Use the formatValidationErrors method to transform errors to the expected format
        return res.status(400).json(
          ResponseHandler.validationError(
            errors.array().map(error => ({
              message: String(error.msg)
            }))
          )
        );
      }
      next();
    }
  ];
};

