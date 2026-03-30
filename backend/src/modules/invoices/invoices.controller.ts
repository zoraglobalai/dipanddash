import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { AppError } from "../../errors/app-error";
import { InvoicesService } from "./invoices.service";

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export class InvoicesController {
  private readonly invoicesService = new InvoicesService();

  private getContextUser(req: Request) {
    if (!req.user?.id || !req.user.role) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Session expired. Please log in again.");
    }
    return {
      id: req.user.id,
      role: req.user.role
    };
  }

  list = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.invoicesService.listInvoices(
      {
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        status: typeof req.query.status === "string" ? (req.query.status as never) : undefined,
        kitchenStatus:
          typeof req.query.kitchenStatus === "string" ? (req.query.kitchenStatus as never) : undefined,
        paymentMode:
          typeof req.query.paymentMode === "string" ? (req.query.paymentMode as never) : undefined,
        staffId: typeof req.query.staffId === "string" ? req.query.staffId : undefined,
        dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
        page: parsePositiveInt(req.query.page, 1),
        limit: parsePositiveInt(req.query.limit, 10)
      },
      this.getContextUser(req)
    );

    return sendSuccess(res, StatusCodes.OK, "Invoices fetched successfully", data);
  };

  getStats = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.invoicesService.getInvoiceStats(
      {
        staffId: typeof req.query.staffId === "string" ? req.query.staffId : undefined,
        dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined
      },
      this.getContextUser(req)
    );

    return sendSuccess(res, StatusCodes.OK, "Invoice stats fetched successfully", data);
  };

  getById = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.invoicesService.getInvoiceDetails(req.params.id, this.getContextUser(req));
    return sendSuccess(res, StatusCodes.OK, "Invoice fetched successfully", data);
  };

  createFromSync = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.invoicesService.createInvoiceFromSync(req.body, this.getContextUser(req));
    return sendSuccess(
      res,
      result.created ? StatusCodes.CREATED : StatusCodes.OK,
      result.created ? "Invoice synced successfully" : "Invoice already synced",
      { invoice: result.invoice, created: result.created }
    );
  };

  cancel = async (req: Request, res: Response): Promise<Response> => {
    const invoice = await this.invoicesService.cancelInvoice(
      req.params.id,
      typeof req.body.reason === "string" ? req.body.reason : undefined,
      this.getContextUser(req)
    );
    return sendSuccess(res, StatusCodes.OK, "Invoice cancelled successfully", { invoice });
  };

  refund = async (req: Request, res: Response): Promise<Response> => {
    const invoice = await this.invoicesService.refundInvoice(
      req.params.id,
      typeof req.body.reason === "string" ? req.body.reason : undefined,
      this.getContextUser(req)
    );
    return sendSuccess(res, StatusCodes.OK, "Invoice refunded successfully", { invoice });
  };

  updateKitchenStatus = async (req: Request, res: Response): Promise<Response> => {
    const invoice = await this.invoicesService.updateKitchenStatus(
      req.params.id,
      req.body.kitchenStatus,
      this.getContextUser(req)
    );
    return sendSuccess(res, StatusCodes.OK, "Kitchen status updated successfully", { invoice });
  };
}
