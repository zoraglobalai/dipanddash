import { Router } from "express";

import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeModuleAccess } from "../../middlewares/module-access.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { ProcurementController } from "./procurement.controller";
import { purchaseInvoiceImageUpload } from "./procurement-upload.middleware";
import {
  createProductSchema,
  createPurchaseOrderSchema,
  createSupplierSchema,
  deleteProductSchema,
  deleteSupplierSchema,
  productListSchema,
  procurementMetaSchema,
  procurementStatsSchema,
  procurementUnitsSchema,
  purchaseOrderByIdSchema,
  purchaseOrderListSchema,
  supplierListSchema,
  updatePurchaseOrderSchema,
  updateProductSchema,
  updateSupplierSchema
} from "./procurement.validation";

const router = Router();
const procurementController = new ProcurementController();

router.use(authenticate);
router.use(authorizeModuleAccess("purchase"));

router.get("/units", validateRequest(procurementUnitsSchema), asyncHandler(procurementController.getUnits));
router.get("/meta", validateRequest(procurementMetaSchema), asyncHandler(procurementController.getMeta));
router.get("/stats", validateRequest(procurementStatsSchema), asyncHandler(procurementController.getStats));

router.get("/suppliers", validateRequest(supplierListSchema), asyncHandler(procurementController.listSuppliers));
router.post("/suppliers", validateRequest(createSupplierSchema), asyncHandler(procurementController.createSupplier));
router.patch(
  "/suppliers/:id",
  validateRequest(updateSupplierSchema),
  asyncHandler(procurementController.updateSupplier)
);
router.delete(
  "/suppliers/:id",
  validateRequest(deleteSupplierSchema),
  asyncHandler(procurementController.deleteSupplier)
);

router.get("/products", validateRequest(productListSchema), asyncHandler(procurementController.listProducts));
router.post("/products", validateRequest(createProductSchema), asyncHandler(procurementController.createProduct));
router.patch("/products/:id", validateRequest(updateProductSchema), asyncHandler(procurementController.updateProduct));
router.delete("/products/:id", validateRequest(deleteProductSchema), asyncHandler(procurementController.deleteProduct));

router.get(
  "/purchase-orders",
  validateRequest(purchaseOrderListSchema),
  asyncHandler(procurementController.listPurchaseOrders)
);
router.post(
  "/purchase-orders/upload-invoice",
  purchaseInvoiceImageUpload.single("image"),
  asyncHandler(procurementController.uploadInvoiceImage)
);
router.get(
  "/purchase-orders/:id",
  validateRequest(purchaseOrderByIdSchema),
  asyncHandler(procurementController.getPurchaseOrderById)
);
router.post(
  "/purchase-orders",
  validateRequest(createPurchaseOrderSchema),
  asyncHandler(procurementController.createPurchaseOrder)
);
router.patch(
  "/purchase-orders/:id",
  validateRequest(updatePurchaseOrderSchema),
  asyncHandler(procurementController.updatePurchaseOrder)
);

export const procurementRoutes = router;
