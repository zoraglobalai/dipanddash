import type { MigrationInterface, QueryRunner } from "typeorm";

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

export class AddAddOnSauceMappings1777200000000 implements MigrationInterface {
  name = "AddAddOnSauceMappings1777200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await hasEnumType(queryRunner, "add_on_sauces_unit_enum"))) {
      await queryRunner.query(
        `CREATE TYPE "public"."add_on_sauces_unit_enum" AS ENUM(${INGREDIENT_UNITS_ENUM_SQL})`
      );
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "add_on_sauces" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "addOnId" uuid NOT NULL,
        "sauceRecipeId" uuid NOT NULL,
        "quantity" numeric(14,3) NOT NULL,
        "unit" "public"."add_on_sauces_unit_enum" NOT NULL,
        "normalizedQuantity" numeric(14,6) NOT NULL DEFAULT '0',
        "estimatedCostContribution" numeric(14,3) NOT NULL DEFAULT '0',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_add_on_sauces_id" PRIMARY KEY ("id"),
        CONSTRAINT "IDX_add_on_sauces_add_on_unique" UNIQUE ("addOnId", "sauceRecipeId"),
        CONSTRAINT "FK_add_on_sauces_add_on"
          FOREIGN KEY ("addOnId") REFERENCES "add_ons"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_add_on_sauces_sauce_recipe"
          FOREIGN KEY ("sauceRecipeId") REFERENCES "sauce_recipes"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "add_on_sauces"`);

    if (await hasEnumType(queryRunner, "add_on_sauces_unit_enum")) {
      await queryRunner.query(`DROP TYPE "public"."add_on_sauces_unit_enum"`);
    }
  }
}
