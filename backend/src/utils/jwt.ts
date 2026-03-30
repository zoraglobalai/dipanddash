import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { UserRole } from "../constants/roles";

export type AccessTokenPayload = {
  sub: string;
  username: string;
  role: UserRole;
  tokenType: "access";
};

export const signAccessToken = (payload: AccessTokenPayload): string => {
  const expiresIn = env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"];

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn
  });
};

export const verifyAccessToken = (token: string): AccessTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    return decoded as AccessTokenPayload;
  } catch {
    return null;
  }
};
