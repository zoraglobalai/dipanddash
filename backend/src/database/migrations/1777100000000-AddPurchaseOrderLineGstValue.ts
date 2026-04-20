import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddPurchaseOrderLineGstValue1777100000000 implements MigrationInterface {
  name = "AddPurchaseOrderLineGstValue1777100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "purchase_order_lines"
      ADD COLUMN IF NOT EXISTS "gstValue" numeric(12,2) NOT NULL DEFAULT '0'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "purchase_order_lines"
      DROP COLUMN IF EXISTS "gstValue"
    `);
  }
}
