import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodError } from "zod";

import { AppError } from "../errors/app-error";

const formatValidationErrors = (error: ZodError): Record<string, string[]> => {
  const fieldErrors: Record<string, string[]> = {};

  error.errors.forEach((issue) => {
    const path = issue.path.join(".") || "root";
    if (!fieldErrors[path]) {
      fieldErrors[path] = [];
    }
    fieldErrors[path].push(issue.message);
  });

  return fieldErrors;
};

export const validateRequest =
  (schema: AnyZodObject) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        params: req.params,
        query: req.query
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new AppError(422, "Please correct the highlighted fields and try again.", formatValidationErrors(error)));
        return;
      }
      next(error);
    }
  };

