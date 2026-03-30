import { Router } from "express";

import { authRoutes } from "../modules/auth/auth.routes";
import { dashboardRoutes } from "../modules/dashboard/dashboard.routes";
import { rolesRoutes } from "../modules/roles/roles.routes";
import { staffRoutes } from "../modules/staff/staff.routes";
import { attendanceRoutes } from "../modules/attendance/attendance.routes";
import { ingredientsRoutes } from "../modules/ingredients/ingredients.routes";
import { itemsRoutes } from "../modules/items/items.routes";
import { offersRoutes } from "../modules/offers/offers.routes";
import { customersRoutes } from "../modules/customers/customers.routes";
import { invoicesRoutes } from "../modules/invoices/invoices.routes";
import { posCatalogRoutes } from "../modules/pos-catalog/pos-catalog.routes";
import { posSyncRoutes } from "../modules/pos-sync/pos-sync.routes";
import { gamingRoutes } from "../modules/gaming/gaming.routes";
import { procurementRoutes } from "../modules/procurement/procurement.routes";
import { cashAuditRoutes } from "../modules/cash-audit/cash-audit.routes";
import { reportsRoutes } from "../modules/reports/reports.routes";
import { dumpRoutes } from "../modules/dump/dump.routes";
import { outletsRoutes } from "../modules/outlets/outlets.routes";
import { outletTransfersRoutes } from "../modules/outlet-transfers/outlet-transfers.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/staff", staffRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/roles", rolesRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/ingredients", ingredientsRoutes);
router.use("/items", itemsRoutes);
router.use("/offers", offersRoutes);
router.use("/customers", customersRoutes);
router.use("/invoices", invoicesRoutes);
router.use("/pos-catalog", posCatalogRoutes);
router.use("/pos-sync", posSyncRoutes);
router.use("/gaming", gamingRoutes);
router.use("/procurement", procurementRoutes);
router.use("/cash-audit", cashAuditRoutes);
router.use("/reports", reportsRoutes);
router.use("/dump", dumpRoutes);
router.use("/outlets", outletsRoutes);
router.use("/outlet-transfers", outletTransfersRoutes);

export const apiRoutes = router;
