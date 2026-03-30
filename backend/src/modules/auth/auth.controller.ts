import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { AUTH_MESSAGES } from "../../constants/auth";
import { AuthService } from "./auth.service";
import { AppError } from "../../errors/app-error";
import { logger } from "../../utils/logger";
import { clearAuthCookies, setAuthCookies } from "./auth-cookie.util";
import { ClientType, SessionContext } from "./auth.types";
import { env } from "../../config/env";

export class AuthController {
  private readonly authService = new AuthService();

  private resolveClientType(req: Request): ClientType {
    const rawClientType = req.get("x-client-type")?.toLowerCase().trim();
    if (rawClientType === "desktop") {
      return "desktop";
    }
    if (rawClientType === "web") {
      return "web";
    }
    return "unknown";
  }

  private buildSessionContext(req: Request): SessionContext {
    return {
      userAgent: req.get("user-agent") ?? null,
      ipAddress: req.ip ?? null,
      clientType: this.resolveClientType(req)
    };
  }

  private isDesktopClient(req: Request): boolean {
    return this.resolveClientType(req) === "desktop";
  }

  private extractRefreshToken(req: Request): string | null {
    const bodyToken =
      typeof req.body?.refreshToken === "string" && req.body.refreshToken.trim().length > 0
        ? req.body.refreshToken.trim()
        : null;
    if (bodyToken) {
      return bodyToken;
    }

    const cookieToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
    if (cookieToken) {
      return cookieToken;
    }

    const authorizationHeader = req.headers.authorization;
    if (!authorizationHeader) {
      return null;
    }

    const [type, token] = authorizationHeader.split(" ");
    if (type?.toLowerCase() !== "bearer" || !token) {
      return null;
    }

    return token;
  }

  login = async (req: Request, res: Response): Promise<Response> => {
    const { username, password } = req.body;
    const isDesktopClient = this.isDesktopClient(req);
    const { user, accessToken, refreshToken } = await this.authService.login(
      username,
      password,
      this.buildSessionContext(req)
    );

    if (!isDesktopClient) {
      setAuthCookies(res, { accessToken, refreshToken });
    }

    return sendSuccess(
      res,
      StatusCodes.OK,
      `Welcome back, ${user.fullName.split(" ")[0]}`,
      isDesktopClient ? { user, tokens: { accessToken, refreshToken } } : { user }
    );
  };

  refresh = async (req: Request, res: Response): Promise<Response> => {
    const isDesktopClient = this.isDesktopClient(req);
    const refreshToken = this.extractRefreshToken(req);

    if (!refreshToken) {
      clearAuthCookies(res);
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    try {
      const { user, accessToken, refreshToken: nextRefreshToken } = await this.authService.refresh(
        refreshToken,
        this.buildSessionContext(req)
      );

      if (!isDesktopClient) {
        setAuthCookies(res, { accessToken, refreshToken: nextRefreshToken });
      }

      return sendSuccess(
        res,
        StatusCodes.OK,
        AUTH_MESSAGES.REFRESH_SUCCESS,
        isDesktopClient
          ? { user, tokens: { accessToken, refreshToken: nextRefreshToken } }
          : { user }
      );
    } catch (error) {
      clearAuthCookies(res);
      throw error;
    }
  };

  logout = async (req: Request, res: Response): Promise<Response> => {
    try {
      const refreshToken = this.extractRefreshToken(req);
      await this.authService.logout(refreshToken ?? undefined);
    } catch (error) {
      logger.error("Failed to revoke refresh session on logout. Continuing with logout response.", error);
    }

    try {
      clearAuthCookies(res);
    } catch (error) {
      logger.error("Failed to clear auth cookies on logout. Continuing with logout response.", error);
    }

    return sendSuccess(res, StatusCodes.OK, AUTH_MESSAGES.LOGOUT_SUCCESS);
  };

  logoutAll = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    await this.authService.logoutAll(userId);
    clearAuthCookies(res);

    return sendSuccess(res, StatusCodes.OK, AUTH_MESSAGES.LOGOUT_ALL_SUCCESS);
  };

  me = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const user = await this.authService.getMe(userId);
    return sendSuccess(res, StatusCodes.OK, "Session restored successfully", { user });
  };
}
