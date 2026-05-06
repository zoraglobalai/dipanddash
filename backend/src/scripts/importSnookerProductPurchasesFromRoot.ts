import "reflect-metadata";

import { AppDataSource } from "../database/data-source";
import { UserRole } from "../constants/roles";
import { ProcurementService } from "../modules/procurement/procurement.service";
import { Product } from "../modules/procurement/product.entity";
import { PurchaseOrder } from "../modules/procurement/purchase-order.entity";
import { Supplier } from "../modules/procurement/supplier.entity";
import { User } from "../modules/users/user.entity";

type SheetPurchaseRow = {
  rowNumber: number;
  supplierName: string;
  phone: string;
  invoiceNumber: string;
  purchaseDate: string;
  projectName: string;
  month: string;
  productName: string;
  packSize: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  gstPercentage: number;
  gstAmount: number;
  grandTotal: number;
  receivedDate?: string;
};

type PurchaseGroup = {
  supplierName: string;
  phone: string;
  invoiceNumber: string;
  purchaseDate: string;
  projectName: string;
  month: string;
  receivedDate?: string;
  rows: SheetPurchaseRow[];
};

const SHEET_ROWS: SheetPurchaseRow[] = [
  { rowNumber: 3, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Coca-Cola Zero Sugar", packSize: "TIN-300 ml", quantity: 9, unitPrice: 35, amount: 315, gstPercentage: 0, gstAmount: 0, grandTotal: 315 },
  { rowNumber: 4, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Coca-Cola", packSize: "TIN-300 ml", quantity: 8, unitPrice: 35, amount: 280, gstPercentage: 0, gstAmount: 0, grandTotal: 280 },
  { rowNumber: 5, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "BRU Cold Coffe", packSize: "180 ML", quantity: 12, unitPrice: 20, amount: 240, gstPercentage: 0, gstAmount: 0, grandTotal: 240 },
  { rowNumber: 6, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Sprite Drink", packSize: "TIN-300 ml", quantity: 10, unitPrice: 35, amount: 350, gstPercentage: 0, gstAmount: 0, grandTotal: 350 },
  { rowNumber: 7, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Thums Up Drink", packSize: "TIN-300 ml", quantity: 10, unitPrice: 35, amount: 350, gstPercentage: 0, gstAmount: 0, grandTotal: 350 },
  { rowNumber: 8, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Red Bull", packSize: "Energy Box -2", quantity: 8, unitPrice: 99.75, amount: 798, gstPercentage: 0, gstAmount: 0, grandTotal: 798 },
  { rowNumber: 9, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Cavin's Vanilla Milkshake", packSize: "180 ML", quantity: 10, unitPrice: 25, amount: 250, gstPercentage: 0, gstAmount: 0, grandTotal: 250 },
  { rowNumber: 10, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Milky Mist Chocolate Milk Shake", packSize: "170 ML", quantity: 4, unitPrice: 20, amount: 80, gstPercentage: 0, gstAmount: 0, grandTotal: 80 },
  { rowNumber: 11, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Britannia Winkin Cow Thick Milkshake Strawberry", packSize: "180 ML", quantity: 5, unitPrice: 26, amount: 130, gstPercentage: 0, gstAmount: 0, grandTotal: 130 },
  { rowNumber: 12, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Britannia Winkin Cow Thick Milkshake Chocolate", packSize: "180 ML", quantity: 4, unitPrice: 26, amount: 104, gstPercentage: 0, gstAmount: 0, grandTotal: 104 },
  { rowNumber: 13, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Britannia Winkin Cow Thick Milkshake Vennilla", packSize: "180 ML", quantity: 4, unitPrice: 26, amount: 104, gstPercentage: 0, gstAmount: 0, grandTotal: 104 },
  { rowNumber: 14, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Smoodh -Toffe Caramel", packSize: "150 ML", quantity: 5, unitPrice: 17, amount: 85, gstPercentage: 0, gstAmount: 0, grandTotal: 85 },
  { rowNumber: 15, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Smoodh -Chocolate Hozel Nut", packSize: "150 ML", quantity: 5, unitPrice: 16, amount: 80, gstPercentage: 0, gstAmount: 0, grandTotal: 80 },
  { rowNumber: 16, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Dodal Badam Milk", packSize: "180 ML", quantity: 6, unitPrice: 20, amount: 120, gstPercentage: 0, gstAmount: 0, grandTotal: 120 },
  { rowNumber: 17, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Mogu Mogu Ornage Juice", packSize: "320 ML", quantity: 2, unitPrice: 59, amount: 118, gstPercentage: 0, gstAmount: 0, grandTotal: 118 },
  { rowNumber: 18, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Mogu Mogu Grape Juice", packSize: "320 ML", quantity: 2, unitPrice: 59, amount: 118, gstPercentage: 0, gstAmount: 0, grandTotal: 118 },
  { rowNumber: 19, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Mogu Mogu Pineapple Juice", packSize: "320 ML", quantity: 2, unitPrice: 59, amount: 118, gstPercentage: 0, gstAmount: 0, grandTotal: 118 },
  { rowNumber: 20, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Mogu Mogu Lychee Juice", packSize: "320 ML", quantity: 2, unitPrice: 59, amount: 118, gstPercentage: 0, gstAmount: 0, grandTotal: 118 },
  { rowNumber: 21, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Mogu Mogu Starwberry Juice", packSize: "320 ML", quantity: 2, unitPrice: 59, amount: 118, gstPercentage: 0, gstAmount: 0, grandTotal: 118 },
  { rowNumber: 22, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Snickers Chocolate Bar", packSize: "Veg-40 G", quantity: 20, unitPrice: 30, amount: 600, gstPercentage: 0, gstAmount: 0, grandTotal: 600 },
  { rowNumber: 23, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Snickers Butterscotch Flavour Chocolate Bar", packSize: "45 g", quantity: 10, unitPrice: 35, amount: 350, gstPercentage: 0, gstAmount: 0, grandTotal: 350 },
  { rowNumber: 24, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Snickers Peanut Brownie Chocolate", packSize: "45 g", quantity: 5, unitPrice: 59, amount: 295, gstPercentage: 0, gstAmount: 0, grandTotal: 295 },
  { rowNumber: 25, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Cadbury Fuse Chocolate", packSize: "43 g", quantity: 24, unitPrice: 30, amount: 720, gstPercentage: 0, gstAmount: 0, grandTotal: 720 },
  { rowNumber: 26, supplierName: "D Mart-Velachery", phone: "044-22430134", invoiceNumber: "600504012-006959", purchaseDate: "2026-04-28", projectName: "147-Snooker's", month: "April", productName: "Cadbury Chocobakes Cakes", packSize: "12 g -2 Box -24 Qty", quantity: 2, unitPrice: 77.5, amount: 155, gstPercentage: 0, gstAmount: 0, grandTotal: 155 },
  { rowNumber: 27, supplierName: "SS Traders", phone: "9176694097", invoiceNumber: "IN08872627-00479", purchaseDate: "2026-04-27", projectName: "147-Snooker's", month: "April", productName: "Dairy Day Double Cone Blackcurrant & Strawberry - 120ml", packSize: "(120ML*8PCS)", quantity: 8, unitPrice: 38.1, amount: 304.8, gstPercentage: 0.05, gstAmount: 15.24, grandTotal: 320.04, receivedDate: "2026-04-30" },
  { rowNumber: 28, supplierName: "SS Traders", phone: "9176694097", invoiceNumber: "IN08872627-00479", purchaseDate: "2026-04-27", projectName: "147-Snooker's", month: "April", productName: "Dairy Day Sandwich Chocolate Ice cream", packSize: "(80ML*8PCS)", quantity: 8, unitPrice: 22.86, amount: 182.88, gstPercentage: 0.05, gstAmount: 9.144, grandTotal: 192.024 },
  { rowNumber: 29, supplierName: "SS Traders", phone: "9176694097", invoiceNumber: "IN08872627-00479", purchaseDate: "2026-04-27", projectName: "147-Snooker's", month: "April", productName: "Dairy Day Sandwich Coffe Ice cream", packSize: "(70ML*8PCS)", quantity: 8, unitPrice: 22.86, amount: 182.88, gstPercentage: 0.05, gstAmount: 9.144, grandTotal: 192.024 },
  { rowNumber: 30, supplierName: "SS Traders", phone: "9176694097", invoiceNumber: "IN08872627-00479", purchaseDate: "2026-04-27", projectName: "147-Snooker's", month: "April", productName: "Dairy Day Sandwich Vanilla Ice cream", packSize: "(80ML*8PCS)", quantity: 8, unitPrice: 22.86, amount: 182.88, gstPercentage: 0.05, gstAmount: 9.144, grandTotal: 192.024 },
  { rowNumber: 31, supplierName: "SS Traders", phone: "9176694097", invoiceNumber: "IN08872627-00479", purchaseDate: "2026-04-27", projectName: "147-Snooker's", month: "April", productName: "Dairy Day Choco Curran Balckcurrent & Choco Stick Trple Bar", packSize: "(70ML*24PCS)", quantity: 24, unitPrice: 30.48, amount: 731.52, gstPercentage: 0.05, gstAmount: 36.576, grandTotal: 768.096 },
  { rowNumber: 32, supplierName: "SS Traders", phone: "9176694097", invoiceNumber: "IN08872627-00479", purchaseDate: "2026-04-27", projectName: "147-Snooker's", month: "April", productName: "Dairy day Triple Bar Coffee & Choco Stick Ice Cream", packSize: "(70ML*12PCS)", quantity: 12, unitPrice: 30.48, amount: 365.76, gstPercentage: 0.05, gstAmount: 18.288, grandTotal: 384.048 }
];

const mode = process.argv.includes("--execute") ? "execute" : "dry-run";

const toMoney = (value: number) => Number(value.toFixed(2));
const normalizeLookup = (value: string) =>
  value
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase();

const groupRows = () => {
  const groups = new Map<string, PurchaseGroup>();
  for (const row of SHEET_ROWS) {
    const key = [
      normalizeLookup(row.supplierName),
      row.invoiceNumber.trim().toLowerCase(),
      row.purchaseDate
    ].join("|");
    const current =
      groups.get(key) ??
      {
        supplierName: row.supplierName.trim(),
        phone: row.phone.trim(),
        invoiceNumber: row.invoiceNumber.trim(),
        purchaseDate: row.purchaseDate,
        projectName: row.projectName.trim(),
        month: row.month.trim(),
        receivedDate: row.receivedDate,
        rows: []
      };
    current.rows.push(row);
    current.receivedDate = current.receivedDate ?? row.receivedDate;
    groups.set(key, current);
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.purchaseDate !== b.purchaseDate) {
      return a.purchaseDate.localeCompare(b.purchaseDate);
    }
    return a.supplierName.localeCompare(b.supplierName);
  });
};

const getImportNote = (group: PurchaseGroup) => {
  const received = group.receivedDate ? ` | Received: ${group.receivedDate}` : "";
  return `Imported from snookerproducts.xlsx | Invoice: ${group.invoiceNumber} | Project: ${group.projectName} | Month: ${group.month}${received}`;
};

const findImportUserId = async () => {
  const userRepository = AppDataSource.getRepository(User);
  const ansarAdmin = await userRepository
    .createQueryBuilder("user")
    .where("user.role = :role", { role: UserRole.ADMIN })
    .andWhere("user.isActive = true")
    .andWhere("LOWER(user.fullName) = LOWER(:fullName)", { fullName: "Ansar Admin" })
    .getOne();
  if (ansarAdmin) {
    return ansarAdmin.id;
  }

  const fallbackAdmin = await userRepository.findOne({
    where: { role: UserRole.ADMIN, isActive: true },
    order: { createdAt: "ASC" }
  });
  return fallbackAdmin?.id ?? null;
};

const ensureSupplier = async (group: PurchaseGroup) => {
  const supplierRepository = AppDataSource.getRepository(Supplier);
  const existing = await supplierRepository
    .createQueryBuilder("supplier")
    .where("LOWER(supplier.name) = LOWER(:name)", { name: group.supplierName })
    .getOne();

  if (existing) {
    let changed = false;
    if (!existing.isActive) {
      existing.isActive = true;
      changed = true;
    }
    if (!existing.phone?.trim()) {
      existing.phone = group.phone;
      changed = true;
    }
    return {
      supplier: changed && mode === "execute" ? await supplierRepository.save(existing) : existing,
      created: false
    };
  }

  const supplier = supplierRepository.create({
    name: group.supplierName,
    storeName: group.supplierName,
    phone: group.phone,
    address: "Auto-created from snookerproducts.xlsx purchase import",
    isActive: true
  });

  return {
    supplier: mode === "execute" ? await supplierRepository.save(supplier) : supplier,
    created: true
  };
};

const findExistingImport = async (group: PurchaseGroup, supplierId: string) => {
  const purchaseOrderRepository = AppDataSource.getRepository(PurchaseOrder);
  return purchaseOrderRepository.findOne({
    where: {
      supplierId,
      purchaseDate: group.purchaseDate,
      note: getImportNote(group)
    }
  });
};

const validateSheetMath = () => {
  const invalidRows = SHEET_ROWS.filter((row) => {
    const expectedGrandTotal = toMoney(row.quantity * row.unitPrice + row.gstAmount);
    return Math.abs(expectedGrandTotal - toMoney(row.grandTotal)) > 0.01;
  });
  if (invalidRows.length) {
    throw new Error(`Sheet math mismatch on rows: ${invalidRows.map((row) => row.rowNumber).join(", ")}`);
  }
};

const main = async () => {
  validateSheetMath();
  await AppDataSource.initialize();

  const productRepository = AppDataSource.getRepository(Product);
  const procurementService = new ProcurementService();
  const products = await productRepository.find();
  const productByName = new Map(products.map((product) => [normalizeLookup(product.name), product]));
  const groups = groupRows();

  const missingProducts = SHEET_ROWS.filter((row) => !productByName.has(normalizeLookup(row.productName)));
  const nonPcsProducts = SHEET_ROWS.flatMap((row) => {
    const product = productByName.get(normalizeLookup(row.productName));
    return product && product.unit !== "pcs" ? [`${product.name} (${product.unit})`] : [];
  });

  if (missingProducts.length || nonPcsProducts.length) {
    throw new Error(
      JSON.stringify(
        {
          missingProducts: missingProducts.map((row) => ({ rowNumber: row.rowNumber, productName: row.productName })),
          nonPcsProducts
        },
        null,
        2
      )
    );
  }

  const createdByUserId = await findImportUserId();
  const summary = {
    mode,
    sheetRows: SHEET_ROWS.length,
    purchaseGroups: groups.length,
    createdSuppliers: 0,
    skippedExistingPurchaseOrders: 0,
    insertedPurchaseOrders: 0,
    insertedLines: 0,
    totalPurchaseValue: 0,
    groups: [] as Array<{
      supplierName: string;
      purchaseDate: string;
      invoiceNumber: string;
      lineCount: number;
      quantity: number;
      total: number;
      status: "pending" | "inserted" | "skipped_existing";
    }>
  };

  for (const group of groups) {
    const { supplier, created } = await ensureSupplier(group);
    if (created) {
      summary.createdSuppliers += 1;
    }

    if (!supplier.id && mode === "dry-run") {
      summary.groups.push({
        supplierName: group.supplierName,
        purchaseDate: group.purchaseDate,
        invoiceNumber: group.invoiceNumber,
        lineCount: group.rows.length,
        quantity: group.rows.reduce((total, row) => total + row.quantity, 0),
        total: toMoney(group.rows.reduce((total, row) => total + toMoney(row.quantity * row.unitPrice + row.gstAmount), 0)),
        status: "pending"
      });
      continue;
    }

    const existingImport = await findExistingImport(group, supplier.id);
    if (existingImport) {
      summary.skippedExistingPurchaseOrders += 1;
      summary.groups.push({
        supplierName: group.supplierName,
        purchaseDate: group.purchaseDate,
        invoiceNumber: group.invoiceNumber,
        lineCount: group.rows.length,
        quantity: group.rows.reduce((total, row) => total + row.quantity, 0),
        total: toMoney(group.rows.reduce((total, row) => total + toMoney(row.quantity * row.unitPrice + row.gstAmount), 0)),
        status: "skipped_existing"
      });
      continue;
    }

    const lines = group.rows.map((row) => {
      const product = productByName.get(normalizeLookup(row.productName));
      if (!product) {
        throw new Error(`Product missing during import: ${row.productName}`);
      }
      return {
        lineType: "product" as const,
        productId: product.id,
        quantity: row.quantity,
        quantityUnit: "pcs",
        unitPrice: row.unitPrice,
        gstValue: row.gstAmount,
        note: `Invoice ${group.invoiceNumber}, row ${row.rowNumber}, pack ${row.packSize}`
      };
    });

    const groupTotal = toMoney(lines.reduce((total, line) => total + toMoney(line.quantity * line.unitPrice + line.gstValue), 0));

    if (mode === "execute") {
      await procurementService.createPurchaseOrder(
        {
          supplierId: supplier.id,
          purchaseDate: group.purchaseDate,
          purchaseSection: "gaming",
          note: getImportNote(group),
          lines
        },
        createdByUserId
      );

      const touchedProducts = group.rows
        .map((row) => productByName.get(normalizeLookup(row.productName)))
        .filter((product): product is Product => Boolean(product));
      for (const product of touchedProducts) {
        const sourceRow = group.rows.find((row) => normalizeLookup(row.productName) === normalizeLookup(product.name));
        if (sourceRow && !product.packSize) {
          product.packSize = sourceRow.packSize;
          product.defaultSupplierId = product.defaultSupplierId ?? supplier.id;
          await productRepository.save(product);
        }
      }
    }

    summary.insertedPurchaseOrders += mode === "execute" ? 1 : 0;
    summary.insertedLines += mode === "execute" ? lines.length : 0;
    summary.totalPurchaseValue = toMoney(summary.totalPurchaseValue + groupTotal);
    summary.groups.push({
      supplierName: group.supplierName,
      purchaseDate: group.purchaseDate,
      invoiceNumber: group.invoiceNumber,
      lineCount: group.rows.length,
      quantity: group.rows.reduce((total, row) => total + row.quantity, 0),
      total: groupTotal,
      status: mode === "execute" ? "inserted" : "pending"
    });
  }

  console.log(JSON.stringify(summary, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });
