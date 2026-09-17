import { Response } from 'express';
import { ValidationError } from '../interfaces/error.interface';

class ResponseHandler<T = unknown> {
  statusCode: number;
  data: T | null;
  message: string;
  success: boolean;

  constructor(
    statusCode: number,
    message = '',
    data: T | null = null,
    success = true
  ) {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400 && success;
  }

  // This method will be used to send the response

  static success<T>(data: T, message = 'Success'): ResponseHandler<T> {
    return new ResponseHandler<T>(200, message, data);
  }

  static created<T>(data: T, message = 'Created'): ResponseHandler<T> {
    return new ResponseHandler<T>(201, message, data);
  }

  static noContent(message = 'No Content'): ResponseHandler<null> {
    return new ResponseHandler<null>(204, message);
  }

  static deleted(message = 'Deleted'): ResponseHandler<null> {
    return new ResponseHandler<null>(204, message);
  }

  static updated<T>(data: T, message = 'Updated'): ResponseHandler<T> {
    return new ResponseHandler<T>(200, message, data);
  }

  static notModified(message = 'Not Modified'): ResponseHandler<null> {
    return new ResponseHandler<null>(304, message);
  }

  static badRequest(message = 'Bad Request'): ResponseHandler<null> {
    return new ResponseHandler<null>(400, message, null, false);
  }

  static unauthorized(message = 'Unauthorized'): ResponseHandler<null> {
    return new ResponseHandler<null>(401, message, null, false);
  }

  static forbidden(message = 'Forbidden'): ResponseHandler<null> {
    return new ResponseHandler<null>(403, message, null, false);
  }

  static notFound(message = 'Not Found'): ResponseHandler<null> {
    return new ResponseHandler<null>(404, message, null, false);
  }

  static methodNotAllowed(
    message = 'Method Not Allowed'
  ): ResponseHandler<null> {
    return new ResponseHandler<null>(405, message, null, false);
  }

  static conflict(message = 'Conflict'): ResponseHandler<null> {
    return new ResponseHandler<null>(409, message, null, false);
  }

  static tooManyRequests(message = 'Too Many Requests'): ResponseHandler<null> {
    return new ResponseHandler<null>(429, message, null, false);
  }

  static internalServerError(
    message = 'Internal Server Error'
  ): ResponseHandler<null> {
    return new ResponseHandler<null>(500, message, null, false);
  }

  static serviceUnavailable(
    message = 'Service Unavailable'
  ): ResponseHandler<null> {
    return new ResponseHandler<null>(503, message, null, false);
  }

  static gatewayTimeout(message = 'Gateway Timeout'): ResponseHandler<null> {
    return new ResponseHandler<null>(504, message, null, false);
  }

  static custom<T>(
    statusCode: number,
    message: string,
    data: T
  ): ResponseHandler<T> {
    return new ResponseHandler<T>(statusCode, message, data);
  }

  static customError(
    statusCode: number,
    message: string
  ): ResponseHandler<null> {
    return new ResponseHandler<null>(statusCode, message, null, false);
  }

  static customSuccess<T>(
    statusCode: number,
    message: string,
    data: T
  ): ResponseHandler<T> {
    return new ResponseHandler<T>(statusCode, message, data);
  }

  static customResponse<T>(
    statusCode: number,
    message: string,
    data: T | null,
    success: boolean
  ): ResponseHandler<T> {
    return new ResponseHandler<T>(statusCode, message, data, success);
  }

  static error(
    statusCode: number,
    message = `oops! something went wrong, please contact us.`
  ): ResponseHandler<null> {
    return new ResponseHandler<null>(statusCode, message, null, false);
  }

  static validationError(
    errors: ValidationError | ValidationError[]
  ): ResponseHandler<ValidationError | ValidationError[]> {
    return new ResponseHandler<ValidationError | ValidationError[]>(
      400,
      'Validation Error',
      errors,
      false
    );
  }

  static notFoundError(message: string): ResponseHandler<null> {
    return new ResponseHandler<null>(404, message, null, false);
  }

  static conflictError(message: string): ResponseHandler<null> {
    return new ResponseHandler<null>(409, message, null, false);
  }

  static unauthorizedError(message: string): ResponseHandler<null> {
    return new ResponseHandler<null>(401, message, null, false);
  }

  static forbiddenError(message: string): ResponseHandler<null> {
    return new ResponseHandler<null>(403, message, null, false);
  }

  send(res: Response): Response {
    return res.status(this.statusCode).json(this);
  }
}

export default ResponseHandler;
