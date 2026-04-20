import { Router } from "express";

import { asyncHandler } from "../../middlewares/async-handler";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorizeAnyModuleAccess, authorizeModuleAccess } from "../../middlewares/module-access.middleware";
import { validateRequest } from "../../middlewares/validate.middleware";
import { purchaseBulkUpload } from "./procurement-bulk-upload.middleware";
import { ProcurementController } from "./procurement.controller";
import { purchaseInvoiceImageUpload } from "./procurement-upload.middleware";
import {
  createProductSchema,
  createPurchaseOrderSchema,
  deletePurchaseOrderSchema,
  createSupplierSchema,
  deleteProductLedgerRecordSchema,
  deleteProductSchema,
  deleteSupplierSchema,
  getProductSchema,
  productLedgerSchema,
  productListSchema,
  procurementMetaSchema,
  procurementStatsSchema,
  procurementUnitsSchema,
  purchaseOrderByIdSchema,
  purchaseOrderListSchema,
  supplierListSchema,
  upsertProductLedgerRecordSchema,
  updatePurchaseOrderSchema,
  updateProductSchema,
  updateSupplierSchema
} from "./procurement.validation";

const router = Router();
const procurementController = new ProcurementController();
const authorizePurchaseModule = authorizeModuleAccess("purchase");
const authorizeSuppliersModule = authorizeModuleAccess("suppliers");
const authorizeAssetsOrPurchaseModule = authorizeAnyModuleAccess("assets-entry", "purchase");
const authorizeProcurementMetaModule = authorizeAnyModuleAccess("purchase", "assets-entry", "suppliers");

router.use(authenticate);

router.get(
  "/units",
  authorizeProcurementMetaModule,
  validateRequest(procurementUnitsSchema),
  asyncHandler(procurementController.getUnits)
);
router.get(
  "/meta",
  authorizeProcurementMetaModule,
  validateRequest(procurementMetaSchema),
  asyncHandler(procurementController.getMeta)
);
router.get(
  "/stats",
  authorizeProcurementMetaModule,
  validateRequest(procurementStatsSchema),
  asyncHandler(procurementController.getStats)
);

router.get(
  "/suppliers",
  authorizeSuppliersModule,
  validateRequest(supplierListSchema),
  asyncHandler(procurementController.listSuppliers)
);
router.post(
  "/suppliers",
  authorizeSuppliersModule,
  validateRequest(createSupplierSchema),
  asyncHandler(procurementController.createSupplier)
);
router.patch(
  "/suppliers/:id",
  authorizeSuppliersModule,
  validateRequest(updateSupplierSchema),
  asyncHandler(procurementController.updateSupplier)
);
router.delete(
  "/suppliers/:id",
  authorizeSuppliersModule,
  validateRequest(deleteSupplierSchema),
  asyncHandler(procurementController.deleteSupplier)
);

router.get(
  "/products",
  authorizeAssetsOrPurchaseModule,
  validateRequest(productListSchema),
  asyncHandler(procurementController.listProducts)
);
router.get(
  "/products/ledger",
  authorizeAssetsOrPurchaseModule,
  validateRequest(productLedgerSchema),
  asyncHandler(procurementController.listProductLedger)
);
router.patch(
  "/products/ledger/:productId/:date",
  authorizeAssetsOrPurchaseModule,
  validateRequest(upsertProductLedgerRecordSchema),
  asyncHandler(procurementController.updateProductLedgerRecord)
);
router.delete(
  "/products/ledger/:productId/:date",
  authorizeAssetsOrPurchaseModule,
  validateRequest(deleteProductLedgerRecordSchema),
  asyncHandler(procurementController.deleteProductLedgerRecord)
);
router.get(
  "/products/bulk/template",
  authorizeAssetsOrPurchaseModule,
  asyncHandler(procurementController.downloadProductBulkTemplate)
);
router.post(
  "/products/bulk/import",
  authorizeAssetsOrPurchaseModule,
  purchaseBulkUpload.single("file"),
  asyncHandler(procurementController.bulkImportProducts)
);
router.get(
  "/products/:id",
  authorizeAssetsOrPurchaseModule,
  validateRequest(getProductSchema),
  asyncHandler(procurementController.getProduct)
);
router.post(
  "/products",
  authorizeAssetsOrPurchaseModule,
  validateRequest(createProductSchema),
  asyncHandler(procurementController.createProduct)
);
router.patch(
  "/products/:id",
  authorizeAssetsOrPurchaseModule,
  validateRequest(updateProductSchema),
  asyncHandler(procurementController.updateProduct)
);
router.delete(
  "/products/:id",
  authorizeAssetsOrPurchaseModule,
  validateRequest(deleteProductSchema),
  asyncHandler(procurementController.deleteProduct)
);

router.get(
  "/purchase-orders",
  authorizePurchaseModule,
  validateRequest(purchaseOrderListSchema),
  asyncHandler(procurementController.listPurchaseOrders)
);
router.post(
  "/purchase-orders/upload-invoice",
  authorizePurchaseModule,
  purchaseInvoiceImageUpload.single("image"),
  asyncHandler(procurementController.uploadInvoiceImage)
);
router.get(
  "/purchase-orders/bulk/template",
  authorizePurchaseModule,
  asyncHandler(procurementController.downloadPurchaseBulkTemplate)
);
router.post(
  "/purchase-orders/bulk/import",
  authorizePurchaseModule,
  purchaseBulkUpload.single("file"),
  asyncHandler(procurementController.bulkImportPurchaseOrder)
);
router.get(
  "/purchase-orders/:id",
  authorizePurchaseModule,
  validateRequest(purchaseOrderByIdSchema),
  asyncHandler(procurementController.getPurchaseOrderById)
);
router.post(
  "/purchase-orders",
  authorizePurchaseModule,
  validateRequest(createPurchaseOrderSchema),
  asyncHandler(procurementController.createPurchaseOrder)
);
router.patch(
  "/purchase-orders/:id",
  authorizePurchaseModule,
  validateRequest(updatePurchaseOrderSchema),
  asyncHandler(procurementController.updatePurchaseOrder)
);
router.delete(
  "/purchase-orders/:id",
  authorizePurchaseModule,
  validateRequest(deletePurchaseOrderSchema),
  asyncHandler(procurementController.deletePurchaseOrder)
);

export const procurementRoutes = router;
