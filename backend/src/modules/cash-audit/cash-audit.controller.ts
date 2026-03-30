import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { AUTH_MESSAGES } from "../../constants/auth";
import { AppError } from "../../errors/app-error";
import { CashAuditService } from "./cash-audit.service";

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export class CashAuditController {
  private readonly cashAuditService = new CashAuditService();

  createEntry = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const entry = await this.cashAuditService.createEntry(req.user, req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Cash audit entry saved successfully.", { entry });
  };

  listAdminRecords = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.cashAuditService.listAdminRecords({
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
      section: typeof req.query.section === "string" ? (req.query.section as "dip_and_dash" | "gaming") : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });

    return sendSuccess(res, StatusCodes.OK, "Cash audit records fetched successfully.", data);
  };

  getAdminStats = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.cashAuditService.getAdminStats({
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
      section: typeof req.query.section === "string" ? (req.query.section as "dip_and_dash" | "gaming") : undefined
    });

    return sendSuccess(res, StatusCodes.OK, "Cash audit stats fetched successfully.", data);
  };

  getStaffLastAuditInfo = async (_req: Request, res: Response): Promise<Response> => {
    const data = await this.cashAuditService.getStaffLastAuditInfo();
    return sendSuccess(res, StatusCodes.OK, "Last cash audit status fetched successfully.", data);
  };

  getStaffExpectedBreakdown = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const data = await this.cashAuditService.getStaffExpectedBreakdown(req.user, {
      auditDate: typeof req.query.auditDate === "string" ? req.query.auditDate : undefined
    });
    return sendSuccess(res, StatusCodes.OK, "Expected payment breakdown fetched successfully.", data);
  };
}
