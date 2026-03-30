import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { PosCatalogService } from "./pos-catalog.service";

export class PosCatalogController {
  private readonly posCatalogService = new PosCatalogService();

  getSnapshot = async (req: Request, res: Response): Promise<Response> => {
    const snapshot = await this.posCatalogService.getSnapshot({
      sinceVersion: typeof req.query.sinceVersion === "string" ? req.query.sinceVersion : undefined,
      allocationDate:
        typeof req.query.allocationDate === "string" ? req.query.allocationDate : undefined
    });

    return sendSuccess(res, StatusCodes.OK, "POS catalog snapshot fetched successfully", { snapshot });
  };
}

