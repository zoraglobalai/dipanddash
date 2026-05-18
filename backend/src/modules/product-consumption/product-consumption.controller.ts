import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { AUTH_MESSAGES } from "../../constants/auth";
import { AppError } from "../../errors/app-error";
import { ProductConsumptionService } from "./product-consumption.service";

type UploadRequest = Request & {
  file?: Express.Multer.File;
};

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export class ProductConsumptionController {
  private readonly service = new ProductConsumptionService();

  downloadTemplate = async (_req: Request, res: Response): Promise<Response> => {
    const template = this.service.getTemplate();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${template.fileName}"`);
    return res.status(StatusCodes.OK).send(template.content);
  };

  importFile = async (req: UploadRequest, res: Response): Promise<Response> => {
    if (!req.file) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Please choose a product consumption file to upload.");
    }
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }
    const data = await this.service.importConsumptionFile(req.file.buffer, userId, req.file.originalname);
    return sendSuccess(res, StatusCodes.CREATED, "Product consumption imported successfully", data);
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }
    const data = await this.service.createConsumption(req.body, userId);
    return sendSuccess(res, StatusCodes.CREATED, "Product consumption added successfully", data);
  };

  list = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.service.listConsumptions({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Product consumptions fetched successfully", data);
  };

  listHistory = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.service.listImportHistory({
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Product consumption upload history fetched successfully", data);
  };

  deleteHistory = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.service.deleteImportHistory(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Product consumption upload deleted and stock restored successfully", data);
  };
}
