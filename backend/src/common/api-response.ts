import { Response } from "express";

export type ApiSuccess<T = unknown> = {
  success: true;
  message: string;
  data?: T;
};

export type ApiError = {
  success: false;
  message: string;
  errors?: unknown;
};

export const sendSuccess = <T>(
  res: Response,
  statusCode: number,
  message: string,
  data?: T
): Response<ApiSuccess<T>> => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

export const sendError = (
  res: Response,
  statusCode: number,
  message: string,
  errors?: unknown
): Response<ApiError> => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors
  });
};

