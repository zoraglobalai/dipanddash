import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductSectionStocksAndPurchaseLineSplit1776200000000 implements MigrationInterface {
  name = "AddProductSectionStocksAndPurchaseLineSplit1776200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasProductsTable = await queryRunner.hasTable("products");
    if (hasProductsTable) {
      const hasDipAndDashStock = await queryRunner.hasColumn("products", "dipAndDashStock");
      if (!hasDipAndDashStock) {
        await queryRunner.query(
          `ALTER TABLE "products" ADD "dipAndDashStock" numeric(12,3) NOT NULL DEFAULT '0'`
        );
      }

      const hasGamingStock = await queryRunner.hasColumn("products", "gamingStock");
      if (!hasGamingStock) {
        await queryRunner.query(
          `ALTER TABLE "products" ADD "gamingStock" numeric(12,3) NOT NULL DEFAULT '0'`
        );
      }

      await queryRunner.query(`
        UPDATE "products"
        SET
          "dipAndDashStock" = CASE
            WHEN "targetSection" = 'dip_and_dash' OR "targetSection" = 'both' THEN COALESCE("currentStock", 0)
            ELSE 0
          END,
          "gamingStock" = CASE
            WHEN "targetSection" = 'gaming' THEN COALESCE("currentStock", 0)
            ELSE 0
          END
      `);
    }

    const hasPurchaseOrderLinesTable = await queryRunner.hasTable("purchase_order_lines");
    if (hasPurchaseOrderLinesTable) {
      const hasDipAndDashStockAdded = await queryRunner.hasColumn(
        "purchase_order_lines",
        "dipAndDashStockAdded"
      );
      if (!hasDipAndDashStockAdded) {
        await queryRunner.query(
          `ALTER TABLE "purchase_order_lines" ADD "dipAndDashStockAdded" numeric(12,3)`
        );
      }

      const hasGamingStockAdded = await queryRunner.hasColumn(
        "purchase_order_lines",
        "gamingStockAdded"
      );
      if (!hasGamingStockAdded) {
        await queryRunner.query(
          `ALTER TABLE "purchase_order_lines" ADD "gamingStockAdded" numeric(12,3)`
        );
      }

      await queryRunner.query(`
        UPDATE "purchase_order_lines" line
        SET
          "dipAndDashStockAdded" = CASE
            WHEN line."lineType" = 'product' THEN COALESCE(line."stockAdded", 0)
            ELSE NULL
          END,
          "gamingStockAdded" = CASE
            WHEN line."lineType" = 'product' THEN 0
            ELSE NULL
          END
        WHERE line."lineType" = 'product'
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasPurchaseOrderLinesTable = await queryRunner.hasTable("purchase_order_lines");
    if (hasPurchaseOrderLinesTable) {
      const hasGamingStockAdded = await queryRunner.hasColumn(
        "purchase_order_lines",
        "gamingStockAdded"
      );
      if (hasGamingStockAdded) {
        await queryRunner.query(`ALTER TABLE "purchase_order_lines" DROP COLUMN "gamingStockAdded"`);
      }

      const hasDipAndDashStockAdded = await queryRunner.hasColumn(
        "purchase_order_lines",
        "dipAndDashStockAdded"
      );
      if (hasDipAndDashStockAdded) {
        await queryRunner.query(`ALTER TABLE "purchase_order_lines" DROP COLUMN "dipAndDashStockAdded"`);
      }
    }

    const hasProductsTable = await queryRunner.hasTable("products");
    if (hasProductsTable) {
      const hasGamingStock = await queryRunner.hasColumn("products", "gamingStock");
      if (hasGamingStock) {
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "gamingStock"`);
      }

      const hasDipAndDashStock = await queryRunner.hasColumn("products", "dipAndDashStock");
      if (hasDipAndDashStock) {
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "dipAndDashStock"`);
      }
    }
  }
}
