import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddGamingPlayerCount1777600000000 implements MigrationInterface {
  name = "AddGamingPlayerCount1777600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("gaming_bookings");
    if (!hasTable) {
      return;
    }

    const hasColumn = await queryRunner.hasColumn("gaming_bookings", "playerCount");
    if (!hasColumn) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" ADD "playerCount" integer NOT NULL DEFAULT 1`);
    }

    await queryRunner.query(`
      UPDATE "gaming_bookings"
      SET "playerCount" = GREATEST(
        1,
        COALESCE("playerCount", 1),
        COALESCE(jsonb_array_length(COALESCE("customerGroup", '[]'::jsonb)), 0),
        CASE
          WHEN "bookingType" = 'snooker' AND COALESCE("extraMemberCount", 0) > 0 THEN
            (GREATEST(1, COALESCE(jsonb_array_length(COALESCE("resourceCodes", '[]'::jsonb)), 0)) * 4) + COALESCE("extraMemberCount", 0)
          ELSE 0
        END
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("gaming_bookings");
    if (!hasTable) {
      return;
    }

    const hasColumn = await queryRunner.hasColumn("gaming_bookings", "playerCount");
    if (!hasColumn) {
      return;
    }

    await queryRunner.query(`ALTER TABLE "gaming_bookings" DROP COLUMN "playerCount"`);
  }
}

