import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { PendingService } from "./pending.service";

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export class PendingController {
  private readonly pendingService = new PendingService();

  listCustomers = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.pendingService.listPendingCustomers({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });

    return sendSuccess(res, StatusCodes.OK, "Pending customers fetched successfully.", data);
  };

  getCustomerDetails = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.pendingService.getCustomerPendingDetails({
      phone: typeof req.query.phone === "string" ? req.query.phone : undefined,
      name: typeof req.query.name === "string" ? req.query.name : undefined
    });

    return sendSuccess(res, StatusCodes.OK, "Pending customer details fetched successfully.", data);
  };

  collectPendingAmount = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.pendingService.collectPendingAmount(
      req.body,
      req.user?.id ?? ""
    );

    return sendSuccess(res, StatusCodes.OK, "Pending amount collected successfully.", data);
  };
}

