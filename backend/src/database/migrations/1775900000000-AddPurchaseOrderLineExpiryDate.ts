import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPurchaseOrderLineExpiryDate1775900000000 implements MigrationInterface {
  name = "AddPurchaseOrderLineExpiryDate1775900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "purchase_order_lines" ADD "expiryDate" date`);
    await queryRunner.query(
      `CREATE INDEX "IDX_purchase_order_lines_expiry_date" ON "purchase_order_lines" ("expiryDate")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_purchase_order_lines_expiry_date"`);
    await queryRunner.query(`ALTER TABLE "purchase_order_lines" DROP COLUMN "expiryDate"`);
  }
}

