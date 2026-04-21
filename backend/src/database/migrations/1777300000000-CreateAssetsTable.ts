import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAssetsTable1777300000000 implements MigrationInterface {
  name = "CreateAssetsTable1777300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("assets");
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE "assets" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "name" character varying(120) NOT NULL,
          "quantity" numeric(14,3) NOT NULL DEFAULT '0',
          "unit" character varying(32) NOT NULL,
          "isActive" boolean NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_assets_id" PRIMARY KEY ("id"),
          CONSTRAINT "UQ_assets_name" UNIQUE ("name")
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "assets"
    `);
  }
}
