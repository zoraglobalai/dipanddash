import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { AppError } from "../../errors/app-error";
import { ItemsService } from "./items.service";

type UploadRequest = Request & {
  file?: {
    filename: string;
  };
};

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

export class ItemsController {
  private readonly itemsService = new ItemsService();

  uploadImage = async (req: UploadRequest, res: Response): Promise<Response> => {
    if (!req.file) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Please choose an image file to upload.");
    }

    const imageUrl = `${req.protocol}://${req.get("host")}/uploads/items/${req.file.filename}`;
    return sendSuccess(res, StatusCodes.CREATED, "Image uploaded successfully", {
      imageUrl,
      fileName: req.file.filename
    });
  };

  listCategories = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.itemsService.listCategories({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      includeInactive: parseBoolean(req.query.includeInactive, false),
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });

    return sendSuccess(res, StatusCodes.OK, "Item categories fetched successfully", data);
  };

  createCategory = async (req: Request, res: Response): Promise<Response> => {
    const category = await this.itemsService.createCategory(req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Item category created successfully", { category });
  };

  updateCategory = async (req: Request, res: Response): Promise<Response> => {
    const category = await this.itemsService.updateCategory(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Item category updated successfully", { category });
  };

  deleteCategory = async (req: Request, res: Response): Promise<Response> => {
    const category = await this.itemsService.deleteCategory(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Item category deleted successfully", { category });
  };

  listItems = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.itemsService.listItems({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      categoryId: typeof req.query.categoryId === "string" ? req.query.categoryId : undefined,
      includeInactive: parseBoolean(req.query.includeInactive, false),
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Items fetched successfully", data);
  };

  getItem = async (req: Request, res: Response): Promise<Response> => {
    const item = await this.itemsService.getItem(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Item fetched successfully", { item });
  };

  createItem = async (req: Request, res: Response): Promise<Response> => {
    const item = await this.itemsService.createItem(req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Item created successfully", { item });
  };

  updateItem = async (req: Request, res: Response): Promise<Response> => {
    const item = await this.itemsService.updateItem(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Item updated successfully", { item });
  };

  deleteItem = async (req: Request, res: Response): Promise<Response> => {
    const item = await this.itemsService.deleteItem(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Item deleted successfully", { item });
  };

  listAddOns = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.itemsService.listAddOns({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      includeInactive: parseBoolean(req.query.includeInactive, false),
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Add-ons fetched successfully", data);
  };

  getAddOn = async (req: Request, res: Response): Promise<Response> => {
    const addOn = await this.itemsService.getAddOn(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Add-on fetched successfully", { addOn });
  };

  createAddOn = async (req: Request, res: Response): Promise<Response> => {
    const addOn = await this.itemsService.createAddOn(req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Add-on created successfully", { addOn });
  };

  updateAddOn = async (req: Request, res: Response): Promise<Response> => {
    const addOn = await this.itemsService.updateAddOn(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Add-on updated successfully", { addOn });
  };

  deleteAddOn = async (req: Request, res: Response): Promise<Response> => {
    const addOn = await this.itemsService.deleteAddOn(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Add-on deleted successfully", { addOn });
  };

  listCombos = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.itemsService.listCombos({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      includeInactive: parseBoolean(req.query.includeInactive, false),
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Combos fetched successfully", data);
  };

  getCombo = async (req: Request, res: Response): Promise<Response> => {
    const combo = await this.itemsService.getCombo(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Combo fetched successfully", { combo });
  };

  createCombo = async (req: Request, res: Response): Promise<Response> => {
    const combo = await this.itemsService.createCombo(req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Combo created successfully", { combo });
  };

  updateCombo = async (req: Request, res: Response): Promise<Response> => {
    const combo = await this.itemsService.updateCombo(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Combo updated successfully", { combo });
  };

  deleteCombo = async (req: Request, res: Response): Promise<Response> => {
    const combo = await this.itemsService.deleteCombo(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Combo deleted successfully", { combo });
  };

  getMetaIngredients = async (_req: Request, res: Response): Promise<Response> => {
    const ingredients = await this.itemsService.getMetaIngredients();
    return sendSuccess(res, StatusCodes.OK, "Ingredient metadata fetched successfully", { ingredients });
  };

  getMetaCategories = async (_req: Request, res: Response): Promise<Response> => {
    const categories = await this.itemsService.getMetaCategories();
    return sendSuccess(res, StatusCodes.OK, "Item category metadata fetched successfully", { categories });
  };

  getMetaUnits = async (_req: Request, res: Response): Promise<Response> => {
    const units = this.itemsService.getMetaUnits();
    return sendSuccess(res, StatusCodes.OK, "Unit metadata fetched successfully", { units });
  };

  getMetaItems = async (_req: Request, res: Response): Promise<Response> => {
    const items = await this.itemsService.getMetaItems();
    return sendSuccess(res, StatusCodes.OK, "Item metadata fetched successfully", { items });
  };
}
