import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductSellingPriceAndTargetSection1776100000000 implements MigrationInterface {
  name = "AddProductSellingPriceAndTargetSection1776100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."products_targetsection_enum" AS ENUM('dip_and_dash', 'gaming', 'both')`
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD "sellingPrice" numeric(12,2) NOT NULL DEFAULT '0'`
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD "targetSection" "public"."products_targetsection_enum" NOT NULL DEFAULT 'dip_and_dash'`
    );
    await queryRunner.query(`CREATE INDEX "IDX_products_target_section" ON "products" ("targetSection") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_products_target_section"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "targetSection"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sellingPrice"`);
    await queryRunner.query(`DROP TYPE "public"."products_targetsection_enum"`);
  }
}
