import { comparePassword } from "../../utils/password";
import { UserService } from "../users/user.service";
import { AppError } from "../../errors/app-error";
import { AUTH_MESSAGES } from "../../constants/auth";
import { UserRole } from "../../constants/roles";
import { StatusCodes } from "http-status-codes";
import { SessionContext } from "./auth.types";
import { TokenService } from "./token.service";
import { SessionService } from "./session.service";

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  assignedReports: string[];
  assignedModules: string[];
};

export class AuthService {
  private readonly userService = new UserService();
  private readonly tokenService = new TokenService();
  private readonly sessionService = new SessionService();

  async login(username: string, password: string, context?: SessionContext): Promise<{
    user: SessionUser;
    accessToken: string;
    refreshToken: string;
  }> {
    const user = await this.userService.findByUsernameForAuth(username);

    if (!user || !user.passwordHash) {
      throw new AppError(401, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    const isValid = await comparePassword(password, user.passwordHash);

    if (!isValid) {
      throw new AppError(401, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    if (!user.isActive) {
      throw new AppError(403, "Your account is inactive. Please contact an administrator.");
    }

    const sessionUser: SessionUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      assignedReports: user.assignedReports ?? [],
      assignedModules: user.assignedModules ?? []
    };

    const session = await this.sessionService.createPendingSession({
      userId: user.id,
      context
    });

    const refreshToken = this.tokenService.createRefreshToken({
      user: {
        id: sessionUser.id,
        username: sessionUser.username,
        role: sessionUser.role
      },
      sessionId: session.id,
      clientType: context?.clientType
    });
    const refreshPayload = this.tokenService.verifyRefreshToken(refreshToken);
    if (!refreshPayload?.exp) {
      await this.sessionService.revokeSessionById(session.id);
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.SESSION_INVALID);
    }

    await this.sessionService.rotateSession(session, {
      refreshToken,
      expiresAt: new Date(refreshPayload.exp * 1000),
      context
    });

    const accessToken = this.tokenService.createAccessToken({
      user: {
        id: sessionUser.id,
        username: sessionUser.username,
        role: sessionUser.role
      },
      sessionId: session.id,
      clientType: context?.clientType
    });

    return { user: sessionUser, accessToken, refreshToken };
  }

  async refresh(refreshToken: string, context?: SessionContext): Promise<{
    user: SessionUser;
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = this.tokenService.verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const session = await this.sessionService.findById(payload.sid);
    if (!session || session.userId !== payload.sub) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.SESSION_INVALID);
    }

    if (session.isRevoked || this.sessionService.isExpired(session)) {
      await this.sessionService.revokeSession(session);
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    if (!this.sessionService.isRefreshTokenMatch(session, refreshToken)) {
      await this.sessionService.revokeAllForUser(payload.sub);
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.SESSION_INVALID);
    }

    let user: Awaited<ReturnType<UserService["findById"]>>;
    try {
      user = await this.userService.findById(payload.sub);
    } catch {
      await this.sessionService.revokeAllForUser(payload.sub);
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.SESSION_INVALID);
    }

    if (!user.isActive) {
      await this.sessionService.revokeAllForUser(payload.sub);
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Your account is inactive. Please contact an administrator."
      );
    }

    const sessionUser: SessionUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      assignedReports: user.assignedReports ?? [],
      assignedModules: user.assignedModules ?? []
    };

    const nextRefreshToken = this.tokenService.createRefreshToken({
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      },
      sessionId: session.id,
      clientType: context?.clientType ?? payload.clientType
    });
    const nextRefreshPayload = this.tokenService.verifyRefreshToken(nextRefreshToken);
    if (!nextRefreshPayload?.exp) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.SESSION_INVALID);
    }

    await this.sessionService.rotateSession(session, {
      refreshToken: nextRefreshToken,
      expiresAt: new Date(nextRefreshPayload.exp * 1000),
      context
    });

    const accessToken = this.tokenService.createAccessToken({
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      },
      sessionId: session.id,
      clientType: context?.clientType ?? payload.clientType
    });

    return { user: sessionUser, accessToken, refreshToken: nextRefreshToken };
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    const payload = this.tokenService.verifyRefreshToken(refreshToken, { ignoreExpiration: true });
    if (!payload?.sid) {
      return;
    }

    await this.sessionService.revokeSessionById(payload.sid);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionService.revokeAllForUser(userId);
  }

  async getMe(userId: string): Promise<SessionUser> {
    const user = await this.userService.findById(userId);
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      assignedReports: user.assignedReports ?? [],
      assignedModules: user.assignedModules ?? []
    };
  }
}
