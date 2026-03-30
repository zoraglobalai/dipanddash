import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { AppError } from "../../errors/app-error";
import { PosSyncService } from "./pos-sync.service";

export class PosSyncController {
  private readonly posSyncService = new PosSyncService();

  private getContext(req: Request) {
    if (!req.user?.id || !req.user.role) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Session expired. Please log in again.");
    }

    return {
      userId: req.user.id,
      role: req.user.role
    };
  }

  syncBatch = async (req: Request, res: Response): Promise<Response> => {
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    const data = await this.posSyncService.processBatch(events, this.getContext(req));

    return sendSuccess(res, StatusCodes.OK, "POS sync processed successfully", data);
  };

  getSyncStatus = async (req: Request, res: Response): Promise<Response> => {
    const limit = Number(req.query.limit);
    const data = await this.posSyncService.getSyncStatus({
      deviceId: typeof req.query.deviceId === "string" ? req.query.deviceId : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20
    });

    return sendSuccess(res, StatusCodes.OK, "POS sync status fetched successfully", data);
  };
}

