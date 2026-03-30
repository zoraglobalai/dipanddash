import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { AUTH_MESSAGES } from "../../constants/auth";
import { AppError } from "../../errors/app-error";
import { OutletTransfersService } from "./outlet-transfers.service";

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export class OutletTransfersController {
  private readonly outletTransfersService = new OutletTransfersService();

  getOptions = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.outletTransfersService.getTransferOptions(
      typeof req.query.fromOutletId === "string" ? req.query.fromOutletId : undefined
    );
    return sendSuccess(res, StatusCodes.OK, "Transfer options fetched successfully", data);
  };

  createTransfer = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }
    const transfer = await this.outletTransfersService.createTransfer(req.user, req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Outlet transfer completed successfully", { transfer });
  };

  listTransfers = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.outletTransfersService.listTransfers({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
      outletId: typeof req.query.outletId === "string" ? req.query.outletId : undefined,
      fromOutletId: typeof req.query.fromOutletId === "string" ? req.query.fromOutletId : undefined,
      toOutletId: typeof req.query.toOutletId === "string" ? req.query.toOutletId : undefined,
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Outlet transfers fetched successfully", data);
  };
}
