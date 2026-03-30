import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { AUTH_MESSAGES } from "../../constants/auth";
import { AppError } from "../../errors/app-error";
import { DumpService } from "./dump.service";

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export class DumpController {
  private readonly dumpService = new DumpService();

  getEntryOptions = async (_req: Request, res: Response): Promise<Response> => {
    const data = await this.dumpService.getEntryOptions();
    return sendSuccess(res, StatusCodes.OK, "Dump entry options fetched successfully.", data);
  };

  createEntry = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }
    const entry = await this.dumpService.createEntry(req.user, req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Dump entry saved successfully.", { entry });
  };

  listAdminRecords = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.dumpService.listAdminRecords({
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
      entryType: typeof req.query.entryType === "string" ? (req.query.entryType as "ingredient" | "item" | "product") : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Dump records fetched successfully.", data);
  };

  getAdminStats = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.dumpService.getAdminStats({
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
      entryType: typeof req.query.entryType === "string" ? (req.query.entryType as "ingredient" | "item" | "product") : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined
    });
    return sendSuccess(res, StatusCodes.OK, "Dump stats fetched successfully.", data);
  };
}
