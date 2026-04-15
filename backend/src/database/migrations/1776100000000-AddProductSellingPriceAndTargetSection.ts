import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductSellingPriceAndTargetSection1776100000000 implements MigrationInterface {
  name = "AddProductSellingPriceAndTargetSection1776100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasProductsTable = await queryRunner.hasTable("products");
    if (!hasProductsTable) {
      return;
    }

    const typeRows = await queryRunner.query(
      `SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'products_targetsection_enum' LIMIT 1`
    );
    if (!typeRows.length) {
      await queryRunner.query(
        `CREATE TYPE "public"."products_targetsection_enum" AS ENUM('dip_and_dash', 'gaming', 'both')`
      );
    }

    const hasSellingPrice = await queryRunner.hasColumn("products", "sellingPrice");
    if (!hasSellingPrice) {
      await queryRunner.query(
        `ALTER TABLE "products" ADD "sellingPrice" numeric(12,2) NOT NULL DEFAULT '0'`
      );
    }

    const hasTargetSection = await queryRunner.hasColumn("products", "targetSection");
    if (!hasTargetSection) {
      await queryRunner.query(
        `ALTER TABLE "products" ADD "targetSection" "public"."products_targetsection_enum" NOT NULL DEFAULT 'dip_and_dash'`
      );
    }

    const table = await queryRunner.getTable("products");
    const hasTargetSectionIndex =
      table?.indices.some((index) => index.name === "IDX_products_target_section") ?? false;
    if (!hasTargetSectionIndex) {
      await queryRunner.query(`CREATE INDEX "IDX_products_target_section" ON "products" ("targetSection") `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasProductsTable = await queryRunner.hasTable("products");
    if (hasProductsTable) {
      const table = await queryRunner.getTable("products");
      const hasTargetSectionIndex =
        table?.indices.some((index) => index.name === "IDX_products_target_section") ?? false;
      if (hasTargetSectionIndex) {
        await queryRunner.query(`DROP INDEX "public"."IDX_products_target_section"`);
      }

      const hasTargetSection = await queryRunner.hasColumn("products", "targetSection");
      if (hasTargetSection) {
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "targetSection"`);
      }

      const hasSellingPrice = await queryRunner.hasColumn("products", "sellingPrice");
      if (hasSellingPrice) {
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sellingPrice"`);
      }
    }

    const typeRows = await queryRunner.query(
      `SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'products_targetsection_enum' LIMIT 1`
    );
    if (typeRows.length) {
      await queryRunner.query(`DROP TYPE "public"."products_targetsection_enum"`);
    }
  }
}
