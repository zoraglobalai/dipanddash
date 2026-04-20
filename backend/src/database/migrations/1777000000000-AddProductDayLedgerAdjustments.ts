import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductDayLedgerAdjustments1777000000000 implements MigrationInterface {
  name = "AddProductDayLedgerAdjustments1777000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("product_day_ledger_adjustments"))) {
      await queryRunner.query(`
        CREATE TABLE "product_day_ledger_adjustments" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "productId" uuid NOT NULL,
          "date" date NOT NULL,
          "openingDelta" numeric(12,3) NOT NULL DEFAULT '0',
          "purchasedDelta" numeric(12,3) NOT NULL DEFAULT '0',
          "consumptionDelta" numeric(12,3) NOT NULL DEFAULT '0',
          "dipAndDashConsumptionDelta" numeric(12,3) NOT NULL DEFAULT '0',
          "snookerConsumptionDelta" numeric(12,3) NOT NULL DEFAULT '0',
          "note" character varying(255),
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_product_day_ledger_adjustments_id" PRIMARY KEY ("id"),
          CONSTRAINT "UQ_product_day_ledger_adjustments_product_date" UNIQUE ("productId", "date"),
          CONSTRAINT "FK_product_day_ledger_adjustments_product"
            FOREIGN KEY ("productId") REFERENCES "products"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        )
      `);
    }

    if (await queryRunner.hasTable("product_day_ledger_adjustments")) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_product_day_ledger_adjustments_date"
        ON "product_day_ledger_adjustments" ("date")
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_product_day_ledger_adjustments_product"
        ON "product_day_ledger_adjustments" ("productId")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable("product_day_ledger_adjustments")) {
      await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_product_day_ledger_adjustments_product"`);
      await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_product_day_ledger_adjustments_date"`);
      await queryRunner.query(`DROP TABLE "product_day_ledger_adjustments"`);
    }
  }
}
