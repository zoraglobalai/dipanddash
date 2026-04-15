import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPurchaseOrderLineExpiryDate1775900000000 implements MigrationInterface {
  name = "AddPurchaseOrderLineExpiryDate1775900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("purchase_order_lines");
    if (!hasTable) {
      return;
    }

    const hasExpiryDateColumn = await queryRunner.hasColumn("purchase_order_lines", "expiryDate");
    if (!hasExpiryDateColumn) {
      await queryRunner.query(`ALTER TABLE "purchase_order_lines" ADD "expiryDate" date`);
    }

    const table = await queryRunner.getTable("purchase_order_lines");
    const hasExpiryDateIndex =
      table?.indices.some((index) => index.name === "IDX_purchase_order_lines_expiry_date") ?? false;
    if (!hasExpiryDateIndex) {
      await queryRunner.query(
        `CREATE INDEX "IDX_purchase_order_lines_expiry_date" ON "purchase_order_lines" ("expiryDate")`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("purchase_order_lines");
    if (!hasTable) {
      return;
    }

    const table = await queryRunner.getTable("purchase_order_lines");
    const hasExpiryDateIndex =
      table?.indices.some((index) => index.name === "IDX_purchase_order_lines_expiry_date") ?? false;
    if (hasExpiryDateIndex) {
      await queryRunner.query(`DROP INDEX "public"."IDX_purchase_order_lines_expiry_date"`);
    }

    const hasExpiryDateColumn = await queryRunner.hasColumn("purchase_order_lines", "expiryDate");
    if (hasExpiryDateColumn) {
      await queryRunner.query(`ALTER TABLE "purchase_order_lines" DROP COLUMN "expiryDate"`);
    }
  }
}
