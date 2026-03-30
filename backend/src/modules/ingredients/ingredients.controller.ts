import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { AUTH_MESSAGES } from "../../constants/auth";
import { AppError } from "../../errors/app-error";
import { IngredientsService } from "./ingredients.service";

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

export class IngredientsController {
  private readonly ingredientsService = new IngredientsService();

  getPosBillingControl = async (_req: Request, res: Response): Promise<Response> => {
    const data = await this.ingredientsService.getPosBillingControl();
    return sendSuccess(res, StatusCodes.OK, "POS billing control fetched successfully", data);
  };

  updatePosBillingControl = async (req: Request, res: Response): Promise<Response> => {
    const updatedByUserId = req.user?.id;
    if (!updatedByUserId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }
    const data = await this.ingredientsService.updatePosBillingControl(req.body, updatedByUserId);
    return sendSuccess(res, StatusCodes.OK, "POS billing control updated successfully", data);
  };

  getClosingStatus = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }
    const data = await this.ingredientsService.getClosingStatus(userId);
    return sendSuccess(res, StatusCodes.OK, "Closing status fetched successfully", data);
  };

  submitClosingReport = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }
    const data = await this.ingredientsService.submitClosingReport(req.body, userId);
    return sendSuccess(res, StatusCodes.OK, "Closing report submitted successfully", data);
  };

  listClosingReports = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    const role = req.user?.role;
    if (!userId || !role) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }
    const data = await this.ingredientsService.listClosingReports(
      {
        date: typeof req.query.date === "string" ? req.query.date : undefined,
        staffId: typeof req.query.staffId === "string" ? req.query.staffId : undefined,
        page: parsePositiveInt(req.query.page, 1),
        limit: parsePositiveInt(req.query.limit, 10)
      },
      { userId, role }
    );
    return sendSuccess(res, StatusCodes.OK, "Closing reports fetched successfully", data);
  };

  getStockAudit = async (req: Request, res: Response): Promise<Response> => {
    const legacyDate = typeof req.query.date === "string" ? req.query.date : undefined;
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : legacyDate;
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : legacyDate;

    const data = await this.ingredientsService.getStockAudit({
      dateFrom,
      dateTo,
      staffId: typeof req.query.staffId === "string" ? req.query.staffId : undefined,
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 20)
    });
    return sendSuccess(res, StatusCodes.OK, "Stock audit fetched successfully", data);
  };

  listCategories = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.ingredientsService.listCategories({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      includeInactive: parseBoolean(req.query.includeInactive, false),
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });

    return sendSuccess(res, StatusCodes.OK, "Categories fetched successfully", data);
  };

  createCategory = async (req: Request, res: Response): Promise<Response> => {
    const category = await this.ingredientsService.createCategory(req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Category created successfully", { category });
  };

  updateCategory = async (req: Request, res: Response): Promise<Response> => {
    const category = await this.ingredientsService.updateCategory(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Category updated successfully", { category });
  };

  deleteCategory = async (req: Request, res: Response): Promise<Response> => {
    const category = await this.ingredientsService.deleteCategory(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Category deleted successfully", { category });
  };

  listIngredients = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.ingredientsService.listIngredients({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      categoryId: typeof req.query.categoryId === "string" ? req.query.categoryId : undefined,
      includeInactive: parseBoolean(req.query.includeInactive, true),
      withMovementStats: parseBoolean(req.query.withMovementStats, false),
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });

    return sendSuccess(res, StatusCodes.OK, "Ingredients fetched successfully", data);
  };

  createIngredient = async (req: Request, res: Response): Promise<Response> => {
    const ingredient = await this.ingredientsService.createIngredient(req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Ingredient created successfully", { ingredient });
  };

  updateIngredient = async (req: Request, res: Response): Promise<Response> => {
    const ingredient = await this.ingredientsService.updateIngredient(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Ingredient updated successfully", { ingredient });
  };

  deleteIngredient = async (req: Request, res: Response): Promise<Response> => {
    const ingredient = await this.ingredientsService.deleteIngredient(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Ingredient deleted successfully", { ingredient });
  };

  getIngredientStock = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.ingredientsService.getIngredientStock(req.params.id, {
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });

    return sendSuccess(res, StatusCodes.OK, "Stock fetched successfully", data);
  };

  addStock = async (req: Request, res: Response): Promise<Response> => {
    const stock = await this.ingredientsService.addStock(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Stock added successfully", { stock });
  };

  adjustStock = async (req: Request, res: Response): Promise<Response> => {
    const stock = await this.ingredientsService.adjustStock(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Stock adjusted successfully", { stock });
  };

  getAllocationStats = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.ingredientsService.getAllocationStats({
      date: typeof req.query.date === "string" ? req.query.date : "",
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      categoryId: typeof req.query.categoryId === "string" ? req.query.categoryId : undefined
    });
    return sendSuccess(res, StatusCodes.OK, "Allocation stats fetched successfully", data);
  };
}
