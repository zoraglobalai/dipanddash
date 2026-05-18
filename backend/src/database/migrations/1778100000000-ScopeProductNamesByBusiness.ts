import { MigrationInterface, QueryRunner } from "typeorm";

export class ScopeProductNamesByBusiness1778100000000 implements MigrationInterface {
  name = "ScopeProductNamesByBusiness1778100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_name_unique"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_products_name_target_section_unique" ON "products" ("name", "targetSection")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_name_target_section_unique"`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_products_name_unique" ON "products" ("name")`);
  }
}
