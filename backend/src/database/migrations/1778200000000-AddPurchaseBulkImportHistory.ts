import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPurchaseBulkImportHistory1778200000000 implements MigrationInterface {
  name = "AddPurchaseBulkImportHistory1778200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "purchase_bulk_imports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "fileName" character varying(260) NOT NULL,
        "purchaseSection" character varying(20) NOT NULL DEFAULT 'gaming',
        "createdByUserId" uuid,
        "summary" jsonb NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_purchase_bulk_imports_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_purchase_bulk_imports_section_created" ON "purchase_bulk_imports" ("purchaseSection", "createdAt")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_purchase_bulk_imports_section_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "purchase_bulk_imports"`);
  }
}
