import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendError } from "../common/api-response";

export const notFoundMiddleware = (req: Request, res: Response): Response => {
  return sendError(
    res,
    StatusCodes.NOT_FOUND,
    `We could not find the requested route: ${req.method} ${req.originalUrl}`
  );
};

