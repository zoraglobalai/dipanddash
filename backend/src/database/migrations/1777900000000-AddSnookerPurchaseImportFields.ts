import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSnookerPurchaseImportFields1777900000000 implements MigrationInterface {
  name = "AddSnookerPurchaseImportFields1777900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasVendorInvoiceNumber = await queryRunner.hasColumn("purchase_orders", "vendorInvoiceNumber");
    if (!hasVendorInvoiceNumber) {
      await queryRunner.query(`ALTER TABLE "purchase_orders" ADD "vendorInvoiceNumber" character varying(80)`);
    }

    const hasProjectName = await queryRunner.hasColumn("purchase_orders", "projectName");
    if (!hasProjectName) {
      await queryRunner.query(`ALTER TABLE "purchase_orders" ADD "projectName" character varying(120)`);
    }

    const hasPurchaseMonth = await queryRunner.hasColumn("purchase_orders", "purchaseMonth");
    if (!hasPurchaseMonth) {
      await queryRunner.query(`ALTER TABLE "purchase_orders" ADD "purchaseMonth" character varying(40)`);
    }

    const hasReceivedDate = await queryRunner.hasColumn("purchase_orders", "receivedDate");
    if (!hasReceivedDate) {
      await queryRunner.query(`ALTER TABLE "purchase_orders" ADD "receivedDate" date`);
    }

    const hasGstPercentage = await queryRunner.hasColumn("purchase_order_lines", "gstPercentage");
    if (!hasGstPercentage) {
      await queryRunner.query(`ALTER TABLE "purchase_order_lines" ADD "gstPercentage" numeric(8,4)`);
    }

    const hasSourceAmount = await queryRunner.hasColumn("purchase_order_lines", "sourceAmount");
    if (!hasSourceAmount) {
      await queryRunner.query(`ALTER TABLE "purchase_order_lines" ADD "sourceAmount" numeric(12,2)`);
    }

    const hasSourceGrandTotal = await queryRunner.hasColumn("purchase_order_lines", "sourceGrandTotal");
    if (!hasSourceGrandTotal) {
      await queryRunner.query(`ALTER TABLE "purchase_order_lines" ADD "sourceGrandTotal" numeric(12,2)`);
    }

    const hasPackSizeSnapshot = await queryRunner.hasColumn("purchase_order_lines", "packSizeSnapshot");
    if (!hasPackSizeSnapshot) {
      await queryRunner.query(`ALTER TABLE "purchase_order_lines" ADD "packSizeSnapshot" character varying(80)`);
    }

    const hasSourceRowNumber = await queryRunner.hasColumn("purchase_order_lines", "sourceRowNumber");
    if (!hasSourceRowNumber) {
      await queryRunner.query(`ALTER TABLE "purchase_order_lines" ADD "sourceRowNumber" integer`);
    }

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_purchase_orders_vendor_invoice" ON "purchase_orders" ("vendorInvoiceNumber")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_purchase_orders_vendor_invoice"`);

    const lineColumns = [
      "sourceRowNumber",
      "packSizeSnapshot",
      "sourceGrandTotal",
      "sourceAmount",
      "gstPercentage"
    ];
    for (const column of lineColumns) {
      if (await queryRunner.hasColumn("purchase_order_lines", column)) {
        await queryRunner.query(`ALTER TABLE "purchase_order_lines" DROP COLUMN "${column}"`);
      }
    }

    const orderColumns = ["receivedDate", "purchaseMonth", "projectName", "vendorInvoiceNumber"];
    for (const column of orderColumns) {
      if (await queryRunner.hasColumn("purchase_orders", column)) {
        await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN "${column}"`);
      }
    }
  }
}
