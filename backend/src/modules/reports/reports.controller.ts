import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { AUTH_MESSAGES } from "../../constants/auth";
import { AppError } from "../../errors/app-error";
import { ReportsService } from "./reports.service";
import type { ReportKey } from "./reports.constants";

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export class ReportsController {
  private readonly reportsService = new ReportsService();

  getCatalog = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const data = await this.reportsService.getCatalog({
      id: req.user.id,
      role: req.user.role
    });

    return sendSuccess(res, StatusCodes.OK, "Reports catalog fetched successfully.", data);
  };

  generateReport = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const data = await this.reportsService.generateReport(
      { id: req.user.id, role: req.user.role },
      {
        reportKey: req.query.reportKey as ReportKey,
        dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        outletId: typeof req.query.outletId === "string" ? req.query.outletId : undefined,
        page: parsePositiveInt(req.query.page, 1),
        limit: parsePositiveInt(req.query.limit, 50)
      }
    );

    return sendSuccess(res, StatusCodes.OK, "Report generated successfully.", data);
  };

  exportStockConsumption = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const format = req.query.format === "pdf" ? "pdf" : "excel";
    const file = await this.reportsService.exportStockConsumptionReport(
      { id: req.user.id, role: req.user.role },
      {
        dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        outletId: typeof req.query.outletId === "string" ? req.query.outletId : undefined
      },
      format
    );

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    return res.status(StatusCodes.OK).send(file.content);
  };

  previewStockConsumptionHtml = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const file = await this.reportsService.exportStockConsumptionHtml(
      { id: req.user.id, role: req.user.role },
      {
        dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        outletId: typeof req.query.outletId === "string" ? req.query.outletId : undefined
      }
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${file.fileName}"`);
    return res.status(StatusCodes.OK).send(file.html);
  };
}
