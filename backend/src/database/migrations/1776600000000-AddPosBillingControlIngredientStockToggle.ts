import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPosBillingControlIngredientStockToggle1776600000000 implements MigrationInterface {
  name = "AddPosBillingControlIngredientStockToggle1776600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_billing_controls" ADD COLUMN IF NOT EXISTS "enforceIngredientStock" boolean NOT NULL DEFAULT true`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pos_billing_controls" DROP COLUMN IF EXISTS "enforceIngredientStock"`
    );
  }
}

