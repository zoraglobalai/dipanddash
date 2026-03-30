import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { UserRole } from "../../constants/roles";
import { GamingService } from "./gaming.service";

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const resolveContext = (req: Request) => ({
  userId: req.user?.id ?? "",
  role: (req.user?.role ?? UserRole.STAFF) as UserRole
});

export class GamingController {
  private readonly gamingService = new GamingService();

  listBookings = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.gamingService.listBookings(
      {
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        bookingType: typeof req.query.bookingType === "string" ? (req.query.bookingType as "snooker" | "console") : undefined,
        status: typeof req.query.status === "string" ? (req.query.status as "upcoming" | "ongoing" | "completed" | "cancelled") : undefined,
        paymentStatus:
          typeof req.query.paymentStatus === "string"
            ? (req.query.paymentStatus as "pending" | "paid" | "refunded")
            : undefined,
        resourceCode: typeof req.query.resourceCode === "string" ? req.query.resourceCode : undefined,
        dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
        page: parsePositiveInt(req.query.page, 1),
        limit: parsePositiveInt(req.query.limit, 10)
      },
      resolveContext(req)
    );

    return sendSuccess(res, StatusCodes.OK, "Gaming bookings fetched successfully", data);
  };

  getStats = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.gamingService.getStats(
      {
        dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined
      },
      resolveContext(req)
    );

    return sendSuccess(res, StatusCodes.OK, "Gaming stats fetched successfully", data);
  };

  getResources = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.gamingService.getResources(resolveContext(req));
    return sendSuccess(res, StatusCodes.OK, "Gaming resources fetched successfully", { resources: data });
  };

  createBooking = async (req: Request, res: Response): Promise<Response> => {
    const booking = await this.gamingService.createBooking(req.body, resolveContext(req));
    return sendSuccess(res, StatusCodes.CREATED, "Gaming booking created successfully", { booking });
  };

  updateBooking = async (req: Request, res: Response): Promise<Response> => {
    const booking = await this.gamingService.updateBooking(req.params.id, req.body, resolveContext(req));
    return sendSuccess(res, StatusCodes.OK, "Gaming booking updated successfully", { booking });
  };

  checkoutBooking = async (req: Request, res: Response): Promise<Response> => {
    const booking = await this.gamingService.checkoutBooking(req.params.id, req.body, resolveContext(req));
    return sendSuccess(res, StatusCodes.OK, "Booking checked out successfully", { booking });
  };

  updatePaymentStatus = async (req: Request, res: Response): Promise<Response> => {
    const booking = await this.gamingService.updatePaymentStatus(
      req.params.id,
      req.body.paymentStatus,
      req.body.paymentMode,
      resolveContext(req)
    );
    return sendSuccess(res, StatusCodes.OK, "Payment status updated successfully", { booking });
  };
}
