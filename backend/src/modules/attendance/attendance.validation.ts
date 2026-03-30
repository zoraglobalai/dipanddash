import { z } from "zod";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const attendancePunchSchema = z.object({
  body: z.object({
    username: z.string().min(3, "Username is required"),
    password: z.string().min(1, "Password is required")
  }),
  params: z.object({}),
  query: z.object({})
});

export const attendanceQuerySchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    date: z
      .string()
      .regex(datePattern, "Date must be in YYYY-MM-DD format")
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(5)
  })
});

export const attendanceAdminQuerySchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    name: z.string().optional(),
    date: z
      .string()
      .regex(datePattern, "Date must be in YYYY-MM-DD format")
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(5)
  })
});
