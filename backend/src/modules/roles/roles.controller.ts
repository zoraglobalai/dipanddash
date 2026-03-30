import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { RolesService } from "./roles.service";

export class RolesController {
  private readonly rolesService = new RolesService();

  list = async (_req: Request, res: Response): Promise<Response> => {
    const roles = this.rolesService.getRoles();
    return sendSuccess(res, StatusCodes.OK, "Roles fetched successfully", { roles });
  };
}

