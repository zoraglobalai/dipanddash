import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { AssetsService } from "./assets.service";

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

export class AssetsController {
  private readonly assetsService = new AssetsService();

  listAssets = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.assetsService.listAssets({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      includeInactive: parseBoolean(req.query.includeInactive, false),
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Assets fetched successfully", data);
  };

  createAsset = async (req: Request, res: Response): Promise<Response> => {
    const asset = await this.assetsService.createAsset(req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Asset created successfully", { asset });
  };

  updateAsset = async (req: Request, res: Response): Promise<Response> => {
    const asset = await this.assetsService.updateAsset(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Asset updated successfully", { asset });
  };

  deleteAsset = async (req: Request, res: Response): Promise<Response> => {
    const asset = await this.assetsService.deleteAsset(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Asset deleted successfully", { asset });
  };
}
