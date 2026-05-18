import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductConsumptionImportHistory1778300000000 implements MigrationInterface {
  name = "AddProductConsumptionImportHistory1778300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_consumption_imports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "fileName" character varying(260) NOT NULL,
        "createdByUserId" uuid,
        "summary" jsonb NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_consumption_imports_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_consumption_imports_created"
      ON "product_consumption_imports" ("createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_consumption_imports_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_consumption_imports"`);
  }
}
