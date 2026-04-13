import { z } from "zod";

export const loginSchema = z.object({
  body: z.object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(6, "Password must be at least 6 characters")
  })
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z
        .string()
        .min(1, "Current password is required"),
      newPassword: z
        .string()
        .min(8, "New password must be at least 8 characters")
        .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, "New password must contain letters and numbers")
    })
    .refine((value) => value.currentPassword !== value.newPassword, {
      message: "New password must be different from current password",
      path: ["newPassword"]
    })
});
