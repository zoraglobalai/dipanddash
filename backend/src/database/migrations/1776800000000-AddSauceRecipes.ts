import { MigrationInterface, QueryRunner } from "typeorm";

const INGREDIENT_UNITS_ENUM_SQL = [
  "mcg",
  "mg",
  "g",
  "kg",
  "quintal",
  "ton",
  "ml",
  "cl",
  "dl",
  "l",
  "gallon",
  "pcs",
  "piece",
  "count",
  "unit",
  "units",
  "pair",
  "dozen",
  "tray",
  "plate",
  "pack",
  "packet",
  "box",
  "bottle",
  "can",
  "jar",
  "tub",
  "pouch",
  "roll",
  "bag",
  "sack",
  "bundle",
  "carton",
  "crate",
  "loaf",
  "block",
  "cup",
  "tablespoon",
  "teaspoon",
  "custom"
]
  .map((unit) => `'${unit}'`)
  .join(", ");

const hasEnumType = async (queryRunner: QueryRunner, enumName: string) => {
  const existing = await queryRunner.query(
    `SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = $1 LIMIT 1`,
    [enumName]
  );
  return Array.isArray(existing) && existing.length > 0;
};

export class AddSauceRecipes1776800000000 implements MigrationInterface {
  name = "AddSauceRecipes1776800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await hasEnumType(queryRunner, "sauce_recipes_outputunit_enum"))) {
      await queryRunner.query(
        `CREATE TYPE "public"."sauce_recipes_outputunit_enum" AS ENUM(${INGREDIENT_UNITS_ENUM_SQL})`
      );
    }
    if (!(await hasEnumType(queryRunner, "sauce_recipe_ingredients_unit_enum"))) {
      await queryRunner.query(
        `CREATE TYPE "public"."sauce_recipe_ingredients_unit_enum" AS ENUM(${INGREDIENT_UNITS_ENUM_SQL})`
      );
    }
    if (!(await hasEnumType(queryRunner, "sauce_batches_producedunit_enum"))) {
      await queryRunner.query(
        `CREATE TYPE "public"."sauce_batches_producedunit_enum" AS ENUM(${INGREDIENT_UNITS_ENUM_SQL})`
      );
    }

    if (!(await queryRunner.hasTable("sauce_recipes"))) {
      await queryRunner.query(`
        CREATE TABLE "sauce_recipes" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "name" character varying(160) NOT NULL,
          "outputIngredientId" uuid NOT NULL,
          "baseBatchQuantity" numeric(14,3) NOT NULL DEFAULT '1',
          "outputUnit" "public"."sauce_recipes_outputunit_enum" NOT NULL,
          "estimatedBatchCost" numeric(14,3) NOT NULL DEFAULT '0',
          "note" character varying(500),
          "isActive" boolean NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_sauce_recipes_id" PRIMARY KEY ("id"),
          CONSTRAINT "IDX_sauce_recipes_name_unique" UNIQUE ("name"),
          CONSTRAINT "IDX_sauce_recipes_output_ingredient_unique" UNIQUE ("outputIngredientId"),
          CONSTRAINT "FK_sauce_recipes_output_ingredient" FOREIGN KEY ("outputIngredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        )
      `);
    }

    if (!(await queryRunner.hasTable("sauce_recipe_ingredients"))) {
      await queryRunner.query(`
        CREATE TABLE "sauce_recipe_ingredients" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "sauceRecipeId" uuid NOT NULL,
          "ingredientId" uuid NOT NULL,
          "quantity" numeric(14,3) NOT NULL,
          "unit" "public"."sauce_recipe_ingredients_unit_enum" NOT NULL,
          "normalizedQuantity" numeric(14,6) NOT NULL DEFAULT '0',
          "costContribution" numeric(14,3) NOT NULL DEFAULT '0',
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_sauce_recipe_ingredients_id" PRIMARY KEY ("id"),
          CONSTRAINT "IDX_sauce_recipe_ingredient_unique" UNIQUE ("sauceRecipeId", "ingredientId"),
          CONSTRAINT "FK_sauce_recipe_ingredients_recipe" FOREIGN KEY ("sauceRecipeId") REFERENCES "sauce_recipes"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
          CONSTRAINT "FK_sauce_recipe_ingredients_ingredient" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        )
      `);
    }

    if (!(await queryRunner.hasTable("sauce_batches"))) {
      await queryRunner.query(`
        CREATE TABLE "sauce_batches" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "sauceRecipeId" uuid NOT NULL,
          "outputIngredientId" uuid NOT NULL,
          "producedQuantity" numeric(14,3) NOT NULL,
          "producedUnit" "public"."sauce_batches_producedunit_enum" NOT NULL,
          "batchFactor" numeric(14,6) NOT NULL DEFAULT '1',
          "consumedCost" numeric(14,3) NOT NULL DEFAULT '0',
          "note" character varying(500),
          "createdByUserId" uuid,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_sauce_batches_id" PRIMARY KEY ("id"),
          CONSTRAINT "FK_sauce_batches_recipe" FOREIGN KEY ("sauceRecipeId") REFERENCES "sauce_recipes"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
          CONSTRAINT "FK_sauce_batches_output_ingredient" FOREIGN KEY ("outputIngredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
          CONSTRAINT "FK_sauce_batches_created_by_user" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
        )
      `);
      await queryRunner.query(`CREATE INDEX "IDX_sauce_batches_recipe" ON "sauce_batches" ("sauceRecipeId")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable("sauce_batches")) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sauce_batches_recipe"`);
      await queryRunner.query(`DROP TABLE "sauce_batches"`);
    }

    if (await queryRunner.hasTable("sauce_recipe_ingredients")) {
      await queryRunner.query(`DROP TABLE "sauce_recipe_ingredients"`);
    }

    if (await queryRunner.hasTable("sauce_recipes")) {
      await queryRunner.query(`DROP TABLE "sauce_recipes"`);
    }

    if (await hasEnumType(queryRunner, "sauce_batches_producedunit_enum")) {
      await queryRunner.query(`DROP TYPE "public"."sauce_batches_producedunit_enum"`);
    }
    if (await hasEnumType(queryRunner, "sauce_recipe_ingredients_unit_enum")) {
      await queryRunner.query(`DROP TYPE "public"."sauce_recipe_ingredients_unit_enum"`);
    }
    if (await hasEnumType(queryRunner, "sauce_recipes_outputunit_enum")) {
      await queryRunner.query(`DROP TYPE "public"."sauce_recipes_outputunit_enum"`);
    }
  }
}
