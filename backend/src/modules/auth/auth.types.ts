import { UserRole } from "../../constants/roles";

export type ClientType = "web" | "desktop" | "unknown";

export type SessionContext = {
  userAgent?: string | null;
  ipAddress?: string | null;
  clientType?: ClientType;
};

export type AccessTokenPayload = {
  sub: string;
  username: string;
  role: UserRole;
  tokenType: "access";
  sid: string;
  clientType: ClientType;
  iat?: number;
  exp?: number;
};

export type RefreshTokenPayload = {
  sub: string;
  username: string;
  role: UserRole;
  tokenType: "refresh";
  sid: string;
  jti: string;
  clientType: ClientType;
  iat?: number;
  exp?: number;
};
