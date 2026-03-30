import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { type CouponDerivedStatus, type CouponDiscountType } from "./offers.constants";
import { OffersService } from "./offers.service";

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }
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
  return undefined;
};

const parseDiscountType = (value: unknown): CouponDiscountType | undefined => {
  if (
    value === "percentage" ||
    value === "fixed_amount" ||
    value === "free_item"
  ) {
    return value;
  }
  return undefined;
};

const parseStatus = (value: unknown): CouponDerivedStatus | undefined => {
  if (
    value === "active" ||
    value === "disabled" ||
    value === "scheduled" ||
    value === "expired"
  ) {
    return value;
  }
  return undefined;
};

export class OffersController {
  private readonly offersService = new OffersService();

  listCoupons = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.offersService.listCoupons({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      discountType: parseDiscountType(req.query.discountType),
      status: parseStatus(req.query.status),
      firstTimeUserOnly: parseOptionalBoolean(req.query.firstTimeUserOnly),
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Coupons fetched successfully", data);
  };

  getCoupon = async (req: Request, res: Response): Promise<Response> => {
    const coupon = await this.offersService.getCoupon(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Coupon fetched successfully", { coupon });
  };

  createCoupon = async (req: Request, res: Response): Promise<Response> => {
    const coupon = await this.offersService.createCoupon(req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Coupon created successfully", { coupon });
  };

  updateCoupon = async (req: Request, res: Response): Promise<Response> => {
    const coupon = await this.offersService.updateCoupon(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Coupon updated successfully", { coupon });
  };

  updateCouponStatus = async (req: Request, res: Response): Promise<Response> => {
    const coupon = await this.offersService.updateCouponStatus(req.params.id, req.body.isActive);
    return sendSuccess(res, StatusCodes.OK, "Coupon status updated successfully", { coupon });
  };

  deleteCoupon = async (req: Request, res: Response): Promise<Response> => {
    const coupon = await this.offersService.deleteCoupon(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Coupon deleted successfully", { coupon });
  };

  listCouponUsages = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.offersService.listCouponUsages(req.params.id, {
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Coupon usages fetched successfully", data);
  };

  getStats = async (_req: Request, res: Response): Promise<Response> => {
    const stats = await this.offersService.getStats();
    return sendSuccess(res, StatusCodes.OK, "Offer stats fetched successfully", { stats });
  };

  getMetaItemCategories = async (_req: Request, res: Response): Promise<Response> => {
    const itemCategories = await this.offersService.getMetaItemCategories();
    return sendSuccess(res, StatusCodes.OK, "Offer category metadata fetched successfully", {
      itemCategories
    });
  };

  getMetaItems = async (req: Request, res: Response): Promise<Response> => {
    const items = await this.offersService.getMetaItems(
      typeof req.query.categoryId === "string" ? req.query.categoryId : undefined
    );
    return sendSuccess(res, StatusCodes.OK, "Offer item metadata fetched successfully", { items });
  };
}
