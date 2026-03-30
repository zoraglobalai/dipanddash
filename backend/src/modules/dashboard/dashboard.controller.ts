import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { DashboardService } from "./dashboard.service";

export class DashboardController {
  private readonly dashboardService = new DashboardService();

  getAdminDashboard = async (_req: Request, res: Response): Promise<Response> => {
    const data = this.dashboardService.getAdminDashboard();
    return sendSuccess(res, StatusCodes.OK, "Dashboard data fetched successfully", data);
  };

  getStaffDashboard = async (req: Request, res: Response): Promise<Response> => {
    const fullName = req.user?.fullName ?? "Team Member";
    const data = this.dashboardService.getStaffDashboard(fullName);
    return sendSuccess(res, StatusCodes.OK, "Dashboard data fetched successfully", data);
  };

  getSalesStats = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.dashboardService.getSalesStats({
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined
    });
    return sendSuccess(res, StatusCodes.OK, "Sales stats fetched successfully", data);
  };
}
