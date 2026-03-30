import { randomUUID } from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";

import { env } from "../../config/env";
import { UserRole } from "../../constants/roles";
import { AccessTokenPayload, ClientType, RefreshTokenPayload } from "./auth.types";

type TokenUser = {
  id: string;
  username: string;
  role: UserRole;
};

type VerifyOptions = {
  ignoreExpiration?: boolean;
};

const toSignOptions = (expiresIn: string): SignOptions => ({
  expiresIn: expiresIn as SignOptions["expiresIn"]
});

export const durationToMs = (value: string, fallbackMs: number): number => {
  if (!value) {
    return fallbackMs;
  }

  const normalized = value.trim().toLowerCase();
  const numericSeconds = Number(normalized);
  if (!Number.isNaN(numericSeconds) && Number.isFinite(numericSeconds) && numericSeconds > 0) {
    return numericSeconds * 1000;
  }

  const match = normalized.match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  if (!match) {
    return fallbackMs;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  const multiplier = multipliers[unit];
  if (!multiplier) {
    return fallbackMs;
  }

  return amount * multiplier;
};

export class TokenService {
  createAccessToken(params: { user: TokenUser; sessionId: string; clientType?: ClientType }): string {
    const payload: AccessTokenPayload = {
      sub: params.user.id,
      username: params.user.username,
      role: params.user.role,
      tokenType: "access",
      sid: params.sessionId,
      clientType: params.clientType ?? "web"
    };

    return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, toSignOptions(env.ACCESS_TOKEN_EXPIRES_IN));
  }

  createRefreshToken(params: { user: TokenUser; sessionId: string; clientType?: ClientType }): string {
    const payload: RefreshTokenPayload = {
      sub: params.user.id,
      username: params.user.username,
      role: params.user.role,
      tokenType: "refresh",
      sid: params.sessionId,
      jti: randomUUID(),
      clientType: params.clientType ?? "web"
    };

    return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, toSignOptions(env.REFRESH_TOKEN_EXPIRES_IN));
  }

  verifyAccessToken(token: string, options?: VerifyOptions): AccessTokenPayload | null {
    try {
      const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET, {
        ignoreExpiration: options?.ignoreExpiration ?? false
      });
      const payload = decoded as AccessTokenPayload;
      if (payload.tokenType !== "access") {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  verifyRefreshToken(token: string, options?: VerifyOptions): RefreshTokenPayload | null {
    try {
      const decoded = jwt.verify(token, env.REFRESH_TOKEN_SECRET, {
        ignoreExpiration: options?.ignoreExpiration ?? false
      });
      const payload = decoded as RefreshTokenPayload;
      if (payload.tokenType !== "refresh") {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }
}
