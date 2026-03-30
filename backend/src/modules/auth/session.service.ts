import { createHash, timingSafeEqual } from "crypto";
import { LessThanOrEqual } from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { AuthSession } from "./auth-session.entity";
import { ClientType, SessionContext } from "./auth.types";

const PENDING_TOKEN_HASH = "PENDING";

const normalizeClientType = (clientType?: ClientType): ClientType => {
  if (!clientType) {
    return "web";
  }
  if (clientType === "desktop" || clientType === "unknown" || clientType === "web") {
    return clientType;
  }
  return "web";
};

export const hashRefreshToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const secureHashMatch = (expectedHash: string, providedHash: string): boolean => {
  const expectedBuffer = Buffer.from(expectedHash);
  const providedBuffer = Buffer.from(providedHash);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
};

export class SessionService {
  private readonly sessionRepository = AppDataSource.getRepository(AuthSession);

  async createPendingSession(params: { userId: string; context?: SessionContext }): Promise<AuthSession> {
    const session = this.sessionRepository.create({
      userId: params.userId,
      refreshTokenHash: PENDING_TOKEN_HASH,
      expiresAt: new Date(),
      isRevoked: false,
      revokedAt: null,
      userAgent: params.context?.userAgent ?? null,
      ipAddress: params.context?.ipAddress ?? null,
      clientType: normalizeClientType(params.context?.clientType),
      lastUsedAt: new Date()
    });

    return this.sessionRepository.save(session);
  }

  async findById(id: string): Promise<AuthSession | null> {
    return this.sessionRepository.findOne({ where: { id } });
  }

  async rotateSession(
    session: AuthSession,
    params: {
      refreshToken: string;
      expiresAt: Date;
      context?: SessionContext;
    }
  ): Promise<AuthSession> {
    session.refreshTokenHash = hashRefreshToken(params.refreshToken);
    session.expiresAt = params.expiresAt;
    session.lastUsedAt = new Date();
    session.isRevoked = false;
    session.revokedAt = null;
    session.userAgent = params.context?.userAgent ?? session.userAgent;
    session.ipAddress = params.context?.ipAddress ?? session.ipAddress;
    session.clientType = normalizeClientType(params.context?.clientType ?? session.clientType);

    return this.sessionRepository.save(session);
  }

  isRefreshTokenMatch(session: AuthSession, refreshToken: string): boolean {
    const providedHash = hashRefreshToken(refreshToken);
    return secureHashMatch(session.refreshTokenHash, providedHash);
  }

  isExpired(session: AuthSession): boolean {
    return session.expiresAt.getTime() <= Date.now();
  }

  async revokeSession(session: AuthSession): Promise<void> {
    if (session.isRevoked) {
      return;
    }

    session.isRevoked = true;
    session.revokedAt = new Date();
    await this.sessionRepository.save(session);
  }

  async revokeSessionById(sessionId: string): Promise<void> {
    await this.sessionRepository.update(
      { id: sessionId, isRevoked: false },
      { isRevoked: true, revokedAt: new Date() }
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.sessionRepository
      .createQueryBuilder()
      .update(AuthSession)
      .set({ isRevoked: true, revokedAt: () => "CURRENT_TIMESTAMP" })
      .where("userId = :userId", { userId })
      .andWhere("isRevoked = false")
      .execute();
  }

  async revokeExpiredSessions(): Promise<void> {
    await this.sessionRepository.update(
      { isRevoked: false, expiresAt: LessThanOrEqual(new Date()) },
      { isRevoked: true, revokedAt: new Date() }
    );
  }
}
