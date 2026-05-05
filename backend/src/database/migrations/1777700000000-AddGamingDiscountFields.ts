import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddGamingDiscountFields1777700000000 implements MigrationInterface {
  name = "AddGamingDiscountFields1777700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("gaming_bookings");
    if (!hasTable) {
      return;
    }

    if (!(await queryRunner.hasColumn("gaming_bookings", "discountType"))) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" ADD "discountType" varchar(20) NOT NULL DEFAULT 'none'`);
    }
    if (!(await queryRunner.hasColumn("gaming_bookings", "discountValue"))) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" ADD "discountValue" numeric(12,2) NOT NULL DEFAULT 0`);
    }
    if (!(await queryRunner.hasColumn("gaming_bookings", "discountAmount"))) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" ADD "discountAmount" numeric(12,2) NOT NULL DEFAULT 0`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("gaming_bookings");
    if (!hasTable) {
      return;
    }

    if (await queryRunner.hasColumn("gaming_bookings", "discountAmount")) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" DROP COLUMN "discountAmount"`);
    }
    if (await queryRunner.hasColumn("gaming_bookings", "discountValue")) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" DROP COLUMN "discountValue"`);
    }
    if (await queryRunner.hasColumn("gaming_bookings", "discountType")) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" DROP COLUMN "discountType"`);
    }
  }
}
