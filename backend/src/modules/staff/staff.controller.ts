import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { StaffService } from "./staff.service";

export class StaffController {
  private readonly staffService = new StaffService();

  list = async (req: Request, res: Response): Promise<Response> => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const staff = await this.staffService.listStaff(search);

    return sendSuccess(res, StatusCodes.OK, "Staff list fetched successfully", { staff });
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    const staff = await this.staffService.createStaff(req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Staff member created successfully", { staff });
  };

  update = async (req: Request, res: Response): Promise<Response> => {
    const staff = await this.staffService.updateStaff(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Staff member updated successfully", { staff });
  };

  updateStatus = async (req: Request, res: Response): Promise<Response> => {
    const staff = await this.staffService.updateStatus(req.params.id, req.body.isActive);
    return sendSuccess(res, StatusCodes.OK, "Staff status updated successfully", { staff });
  };

  resetPassword = async (req: Request, res: Response): Promise<Response> => {
    const staff = await this.staffService.resetPassword(req.params.id, req.body.password);
    return sendSuccess(res, StatusCodes.OK, "Staff password reset successfully", { staff });
  };
}
