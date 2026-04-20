import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPurchaseOrderSection1776700000000 implements MigrationInterface {
  name = "AddPurchaseOrderSection1776700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasPurchaseOrdersTable = await queryRunner.hasTable("purchase_orders");
    if (!hasPurchaseOrdersTable) {
      return;
    }

    const hasPurchaseSection = await queryRunner.hasColumn("purchase_orders", "purchaseSection");
    if (!hasPurchaseSection) {
      await queryRunner.query(
        `ALTER TABLE "purchase_orders" ADD COLUMN "purchaseSection" character varying(20) NOT NULL DEFAULT 'dip_and_dash'`
      );
    }

    const hasPurchaseOrderLinesTable = await queryRunner.hasTable("purchase_order_lines");
    if (hasPurchaseOrderLinesTable) {
      await queryRunner.query(`
        UPDATE "purchase_orders" purchase_order
        SET "purchaseSection" = 'gaming'
        FROM (
          SELECT
            line."purchaseOrderId" AS "purchaseOrderId",
            COALESCE(SUM(COALESCE(line."dipAndDashStockAdded", 0)), 0) AS "dipQty",
            COALESCE(SUM(COALESCE(line."gamingStockAdded", 0)), 0) AS "gamingQty"
          FROM "purchase_order_lines" line
          WHERE line."lineType" = 'product'
          GROUP BY line."purchaseOrderId"
        ) split
        WHERE purchase_order.id = split."purchaseOrderId"
          AND split."gamingQty" > split."dipQty"
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasPurchaseOrdersTable = await queryRunner.hasTable("purchase_orders");
    if (!hasPurchaseOrdersTable) {
      return;
    }

    const hasPurchaseSection = await queryRunner.hasColumn("purchase_orders", "purchaseSection");
    if (hasPurchaseSection) {
      await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN "purchaseSection"`);
    }
  }
}
