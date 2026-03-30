import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { QueryFailedError } from "typeorm";

import { sendError } from "../common/api-response";
import { isProduction } from "../config/env";
import { AppError } from "../errors/app-error";

export const errorMiddleware = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  const parseError = error as Error & {
    status?: number;
    statusCode?: number;
    type?: string;
  };

  if (
    parseError?.type === "entity.parse.failed" ||
    (parseError instanceof SyntaxError &&
      (parseError.status === StatusCodes.BAD_REQUEST ||
        parseError.statusCode === StatusCodes.BAD_REQUEST))
  ) {
    return sendError(res, StatusCodes.BAD_REQUEST, "Invalid JSON payload.");
  }

  if (error instanceof AppError) {
    return sendError(res, error.statusCode, error.message, error.details);
  }

  if (parseError?.name === "MulterError") {
    const code = (parseError as { code?: string }).code;
    if (code === "LIMIT_FILE_SIZE") {
      return sendError(res, StatusCodes.REQUEST_TOO_LONG, "Image size should be 5 MB or less.");
    }

    return sendError(res, StatusCodes.BAD_REQUEST, "Invalid image upload request.");
  }

  if (error instanceof QueryFailedError) {
    return sendError(
      res,
      StatusCodes.CONFLICT,
      "Unable to complete this request due to a database constraint.",
      isProduction ? undefined : error.message
    );
  }

  if (error instanceof Error) {
    return sendError(
      res,
      StatusCodes.INTERNAL_SERVER_ERROR,
      "Something went wrong on our side. Please try again shortly.",
      isProduction ? undefined : error.message
    );
  }

  return sendError(
    res,
    StatusCodes.INTERNAL_SERVER_ERROR,
    "Something went wrong on our side. Please try again shortly."
  );
};
