import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { UserRole } from "../../constants/roles";
import { AppError } from "../../errors/app-error";
import { PendingService } from "./pending.service";

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export class PendingController {
  private readonly pendingService = new PendingService();
  private resolveClientType(req: Request): "desktop" | "web" | "unknown" {
    const rawClientType = req.get("x-client-type")?.toLowerCase().trim();
    if (rawClientType === "desktop") {
      return "desktop";
    }
    if (rawClientType === "web") {
      return "web";
    }
    return "unknown";
  }

  private getContextUser(req: Request) {
    if (!req.user?.id || !req.user.role) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Session expired. Please log in again.");
    }
    return {
      userId: req.user.id,
      role: req.user.role as UserRole,
      clientType: this.resolveClientType(req)
    };
  }

  listCustomers = async (req: Request, res: Response): Promise<Response> => {
    const contextUser = this.getContextUser(req);
    const data = await this.pendingService.listPendingCustomers({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      scope: typeof req.query.scope === "string" ? (req.query.scope as "all" | "dip_and_dash" | "snooker") : undefined,
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    }, contextUser);

    return sendSuccess(res, StatusCodes.OK, "Pending customers fetched successfully.", data);
  };

  getCustomerDetails = async (req: Request, res: Response): Promise<Response> => {
    const contextUser = this.getContextUser(req);
    const data = await this.pendingService.getCustomerPendingDetails({
      phone: typeof req.query.phone === "string" ? req.query.phone : undefined,
      name: typeof req.query.name === "string" ? req.query.name : undefined,
      scope: typeof req.query.scope === "string" ? (req.query.scope as "all" | "dip_and_dash" | "snooker") : undefined
    }, contextUser);

    return sendSuccess(res, StatusCodes.OK, "Pending customer details fetched successfully.", data);
  };

  collectPendingAmount = async (req: Request, res: Response): Promise<Response> => {
    const contextUser = this.getContextUser(req);
    const data = await this.pendingService.collectPendingAmount(
      req.body,
      contextUser
    );

    return sendSuccess(res, StatusCodes.OK, "Pending amount collected successfully.", data);
  };
}
