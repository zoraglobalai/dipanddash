import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { OutletsService } from "./outlets.service";

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const parseBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }
    if (value.toLowerCase() === "false") {
      return false;
    }
  }
  return fallback;
};

export class OutletsController {
  private readonly outletsService = new OutletsService();

  listOutlets = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.outletsService.listOutlets({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      includeInactive: parseBoolean(req.query.includeInactive, true),
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Outlets fetched successfully", data);
  };

  createOutlet = async (req: Request, res: Response): Promise<Response> => {
    const outlet = await this.outletsService.createOutlet(req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Outlet created successfully", { outlet });
  };

  updateOutlet = async (req: Request, res: Response): Promise<Response> => {
    const outlet = await this.outletsService.updateOutlet(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Outlet updated successfully", { outlet });
  };
}
