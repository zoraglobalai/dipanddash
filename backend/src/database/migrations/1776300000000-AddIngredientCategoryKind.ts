import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIngredientCategoryKind1776300000000 implements MigrationInterface {
  name = "AddIngredientCategoryKind1776300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasIngredientCategoriesTable = await queryRunner.hasTable("ingredient_categories");
    if (!hasIngredientCategoriesTable) {
      return;
    }

    const typeRows = await queryRunner.query(
      `SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'ingredient_categories_kind_enum' LIMIT 1`
    );
    if (!typeRows.length) {
      await queryRunner.query(`CREATE TYPE "public"."ingredient_categories_kind_enum" AS ENUM('core', 'additional')`);
    }

    const hasKindColumn = await queryRunner.hasColumn("ingredient_categories", "kind");
    if (!hasKindColumn) {
      await queryRunner.query(
        `ALTER TABLE "ingredient_categories" ADD "kind" "public"."ingredient_categories_kind_enum" NOT NULL DEFAULT 'core'`
      );
    }

    const table = await queryRunner.getTable("ingredient_categories");
    const hasKindIndex =
      table?.indices.some((index) => index.name === "IDX_ingredient_categories_kind") ?? false;
    if (!hasKindIndex) {
      await queryRunner.query(`CREATE INDEX "IDX_ingredient_categories_kind" ON "ingredient_categories" ("kind")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasIngredientCategoriesTable = await queryRunner.hasTable("ingredient_categories");
    if (hasIngredientCategoriesTable) {
      const table = await queryRunner.getTable("ingredient_categories");
      const hasKindIndex =
        table?.indices.some((index) => index.name === "IDX_ingredient_categories_kind") ?? false;
      if (hasKindIndex) {
        await queryRunner.query(`DROP INDEX "public"."IDX_ingredient_categories_kind"`);
      }

      const hasKindColumn = await queryRunner.hasColumn("ingredient_categories", "kind");
      if (hasKindColumn) {
        await queryRunner.query(`ALTER TABLE "ingredient_categories" DROP COLUMN "kind"`);
      }
    }

    const typeRows = await queryRunner.query(
      `SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'ingredient_categories_kind_enum' LIMIT 1`
    );
    if (typeRows.length) {
      await queryRunner.query(`DROP TYPE "public"."ingredient_categories_kind_enum"`);
    }
  }
}
