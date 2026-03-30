import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { CustomersService } from "./customers.service";

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export class CustomersController {
  private readonly customersService = new CustomersService();

  stats = async (_req: Request, res: Response): Promise<Response> => {
    const data = await this.customersService.getCustomerStats();
    return sendSuccess(res, StatusCodes.OK, "Customer stats fetched successfully", data);
  };

  list = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.customersService.listCustomers({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Customers fetched successfully", data);
  };

  searchByPhone = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.customersService.searchCustomersByPhone({
      phone: typeof req.query.phone === "string" ? req.query.phone : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Customer search results fetched successfully", data);
  };

  getById = async (req: Request, res: Response): Promise<Response> => {
    const customer = await this.customersService.getCustomer(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Customer fetched successfully", { customer });
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    const customer = await this.customersService.createCustomer({
      ...req.body,
      createdByUserId: req.user?.id ?? null
    });
    return sendSuccess(res, StatusCodes.CREATED, "Customer created successfully", { customer });
  };

  update = async (req: Request, res: Response): Promise<Response> => {
    const customer = await this.customersService.updateCustomer(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Customer updated successfully", { customer });
  };
}
