import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { AUTH_MESSAGES } from "../../constants/auth";
import { AppError } from "../../errors/app-error";
import type { ProductTargetSection } from "./procurement.constants";
import { ProcurementService } from "./procurement.service";
import { procurementUnitsData } from "./procurement.validation";

type UploadRequest = Request & {
  file?: Express.Multer.File;
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

export class ProcurementController {
  private readonly procurementService = new ProcurementService();

  uploadInvoiceImage = async (req: UploadRequest, res: Response): Promise<Response> => {
    if (!req.file) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Please choose an invoice image to upload.");
    }

    const imageUrl = `${req.protocol}://${req.get("host")}/uploads/purchase-invoices/${req.file.filename}`;
    return sendSuccess(res, StatusCodes.CREATED, "Invoice image uploaded successfully", {
      imageUrl,
      fileName: req.file.filename
    });
  };

  downloadPurchaseBulkTemplate = async (_req: Request, res: Response): Promise<Response> => {
    const template = this.procurementService.getPurchaseBulkImportTemplate();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${template.fileName}"`);
    return res.status(StatusCodes.OK).send(template.content);
  };

  bulkImportPurchaseOrder = async (req: UploadRequest, res: Response): Promise<Response> => {
    if (!req.file) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Please choose a CSV file to upload.");
    }
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const data = await this.procurementService.bulkImportPurchaseOrderFromCsv(req.file.buffer, userId);
    return sendSuccess(res, StatusCodes.CREATED, "Purchase order imported successfully", data);
  };

  downloadProductBulkTemplate = async (_req: Request, res: Response): Promise<Response> => {
    const template = this.procurementService.getProductBulkImportTemplate();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${template.fileName}"`);
    return res.status(StatusCodes.OK).send(template.content);
  };

  bulkImportProducts = async (req: UploadRequest, res: Response): Promise<Response> => {
    if (!req.file) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Please choose a CSV file to upload.");
    }

    const data = await this.procurementService.bulkImportProductsFromCsv(req.file.buffer);
    return sendSuccess(res, StatusCodes.CREATED, "Products imported successfully", data);
  };

  listSuppliers = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.procurementService.listSuppliers({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      includeInactive: parseBoolean(req.query.includeInactive, true),
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Suppliers fetched successfully", data);
  };

  createSupplier = async (req: Request, res: Response): Promise<Response> => {
    const supplier = await this.procurementService.createSupplier(req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Supplier created successfully", { supplier });
  };

  updateSupplier = async (req: Request, res: Response): Promise<Response> => {
    const supplier = await this.procurementService.updateSupplier(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Supplier updated successfully", { supplier });
  };

  deleteSupplier = async (req: Request, res: Response): Promise<Response> => {
    const supplier = await this.procurementService.deleteSupplier(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Supplier deleted successfully", { supplier });
  };

  listProducts = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.procurementService.listProducts({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      category: typeof req.query.category === "string" ? req.query.category : undefined,
      supplierId: typeof req.query.supplierId === "string" ? req.query.supplierId : undefined,
      targetSection:
        typeof req.query.targetSection === "string"
          ? (req.query.targetSection as ProductTargetSection)
          : undefined,
      includeInactive: parseBoolean(req.query.includeInactive, true),
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Products fetched successfully", data);
  };

  listProductLedger = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.procurementService.getProductDayLedger({
      date: typeof req.query.date === "string" ? req.query.date : undefined,
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
      productId: typeof req.query.productId === "string" ? req.query.productId : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      targetSection:
        typeof req.query.targetSection === "string"
          ? (req.query.targetSection as ProductTargetSection)
          : undefined,
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 12)
    });
    return sendSuccess(res, StatusCodes.OK, "Product day ledger fetched successfully", data);
  };

  createProduct = async (req: Request, res: Response): Promise<Response> => {
    const product = await this.procurementService.createProduct(req.body);
    return sendSuccess(res, StatusCodes.CREATED, "Product created successfully", { product });
  };

  updateProduct = async (req: Request, res: Response): Promise<Response> => {
    const product = await this.procurementService.updateProduct(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Product updated successfully", { product });
  };

  deleteProduct = async (req: Request, res: Response): Promise<Response> => {
    const product = await this.procurementService.deleteProduct(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Product deleted successfully", { product });
  };

  listPurchaseOrders = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.procurementService.listPurchaseOrders({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      supplierId: typeof req.query.supplierId === "string" ? req.query.supplierId : undefined,
      purchaseType: typeof req.query.purchaseType === "string" ? (req.query.purchaseType as any) : undefined,
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 10)
    });
    return sendSuccess(res, StatusCodes.OK, "Purchase orders fetched successfully", data);
  };

  getPurchaseOrderById = async (req: Request, res: Response): Promise<Response> => {
    const purchaseOrder = await this.procurementService.getPurchaseOrderById(req.params.id);
    return sendSuccess(res, StatusCodes.OK, "Purchase order fetched successfully", { purchaseOrder });
  };

  createPurchaseOrder = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const purchaseOrder = await this.procurementService.createPurchaseOrder(req.body, userId);
    return sendSuccess(res, StatusCodes.CREATED, "Purchase order created successfully", { purchaseOrder });
  };

  updatePurchaseOrder = async (req: Request, res: Response): Promise<Response> => {
    const purchaseOrder = await this.procurementService.updatePurchaseOrder(req.params.id, req.body);
    return sendSuccess(res, StatusCodes.OK, "Purchase order updated successfully", { purchaseOrder });
  };

  getMeta = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.procurementService.getMeta({
      date: typeof req.query.date === "string" ? req.query.date : undefined,
      ingredientCategoryId:
        typeof req.query.ingredientCategoryId === "string" ? req.query.ingredientCategoryId : undefined,
      ingredientSearch: typeof req.query.ingredientSearch === "string" ? req.query.ingredientSearch : undefined,
      productSearch: typeof req.query.productSearch === "string" ? req.query.productSearch : undefined
    });
    return sendSuccess(res, StatusCodes.OK, "Procurement meta fetched successfully", data);
  };

  getStats = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.procurementService.getStats({
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined
    });
    return sendSuccess(res, StatusCodes.OK, "Procurement stats fetched successfully", data);
  };

  getUnits = async (_req: Request, res: Response): Promise<Response> => {
    return sendSuccess(res, StatusCodes.OK, "Procurement units fetched successfully", procurementUnitsData);
  };
}
