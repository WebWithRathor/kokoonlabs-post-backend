export interface ValidationError {
  field?: string;
  message: string;
  [key: string]: unknown;
}

export interface MongooseValidationError extends Error {
  errors: Record<string, { message: string }>;
}

export interface MongooseDuplicateKeyError extends Error {
  code: number;
  keyValue: Record<string, unknown>;
}

export interface MongooseCastError extends Error {
  path: string;
}
