import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddGamingPaymentSplitColumns1777400000000 implements MigrationInterface {
  name = "AddGamingPaymentSplitColumns1777400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasGamingBookingsTable = await queryRunner.hasTable("gaming_bookings");
    if (!hasGamingBookingsTable) {
      return;
    }

    if (!(await queryRunner.hasColumn("gaming_bookings", "paidCashAmount"))) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" ADD "paidCashAmount" numeric(12,2) NOT NULL DEFAULT '0'`);
    }

    if (!(await queryRunner.hasColumn("gaming_bookings", "paidCardAmount"))) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" ADD "paidCardAmount" numeric(12,2) NOT NULL DEFAULT '0'`);
    }

    if (!(await queryRunner.hasColumn("gaming_bookings", "paidUpiAmount"))) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" ADD "paidUpiAmount" numeric(12,2) NOT NULL DEFAULT '0'`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasGamingBookingsTable = await queryRunner.hasTable("gaming_bookings");
    if (!hasGamingBookingsTable) {
      return;
    }

    if (await queryRunner.hasColumn("gaming_bookings", "paidUpiAmount")) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" DROP COLUMN "paidUpiAmount"`);
    }

    if (await queryRunner.hasColumn("gaming_bookings", "paidCardAmount")) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" DROP COLUMN "paidCardAmount"`);
    }

    if (await queryRunner.hasColumn("gaming_bookings", "paidCashAmount")) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" DROP COLUMN "paidCashAmount"`);
    }
  }
}
