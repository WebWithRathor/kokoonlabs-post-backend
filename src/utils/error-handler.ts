class ErrorHandler extends Error {
  public statusCode: number;
  public errorCode?: string;
  // A 5xx whose message is meant for the user (e.g. "IoT Studio is down"):
  // shown as is in production instead of the generic message
  public expose?: boolean;

  constructor(
    optionsOrStatus: number | { statusCode: number; message: string; errorCode?: string },
    message?: string,
    errorCode: string = "TEMP_ERROR_CODE"
  ) {
    if (typeof optionsOrStatus === "object") {
      super(optionsOrStatus.message);
      this.statusCode = optionsOrStatus.statusCode;
      this.errorCode = optionsOrStatus.errorCode || errorCode;
    } else {
      super(message || "");
      this.statusCode = optionsOrStatus;
      this.errorCode = errorCode;
    }
    Error.captureStackTrace(this, this.constructor);
  }
}

export default ErrorHandler;
