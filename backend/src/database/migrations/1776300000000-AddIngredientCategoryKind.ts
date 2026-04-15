import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIngredientCategoryKind1776300000000 implements MigrationInterface {
  name = "AddIngredientCategoryKind1776300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."ingredient_categories_kind_enum" AS ENUM('core', 'additional')`);
    await queryRunner.query(
      `ALTER TABLE "ingredient_categories" ADD "kind" "public"."ingredient_categories_kind_enum" NOT NULL DEFAULT 'core'`
    );
    await queryRunner.query(`CREATE INDEX "IDX_ingredient_categories_kind" ON "ingredient_categories" ("kind")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_ingredient_categories_kind"`);
    await queryRunner.query(`ALTER TABLE "ingredient_categories" DROP COLUMN "kind"`);
    await queryRunner.query(`DROP TYPE "public"."ingredient_categories_kind_enum"`);
  }
}

