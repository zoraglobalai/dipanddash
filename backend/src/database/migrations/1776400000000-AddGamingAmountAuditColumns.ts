import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGamingAmountAuditColumns1776400000000 implements MigrationInterface {
  name = "AddGamingAmountAuditColumns1776400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasGamingBookingsTable = await queryRunner.hasTable("gaming_bookings");
    if (!hasGamingBookingsTable) {
      return;
    }

    if (!(await queryRunner.hasColumn("gaming_bookings", "systemCalculatedAmount"))) {
      await queryRunner.query(
        `ALTER TABLE "gaming_bookings" ADD "systemCalculatedAmount" numeric(12,2) NOT NULL DEFAULT '0'`
      );
    }

    if (!(await queryRunner.hasColumn("gaming_bookings", "extraMemberCount"))) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" ADD "extraMemberCount" integer NOT NULL DEFAULT '0'`);
    }

    if (!(await queryRunner.hasColumn("gaming_bookings", "extraMemberCharge"))) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" ADD "extraMemberCharge" numeric(12,2) NOT NULL DEFAULT '0'`);
    }

    if (!(await queryRunner.hasColumn("gaming_bookings", "amountOverrideReason"))) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" ADD "amountOverrideReason" text`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasGamingBookingsTable = await queryRunner.hasTable("gaming_bookings");
    if (!hasGamingBookingsTable) {
      return;
    }

    if (await queryRunner.hasColumn("gaming_bookings", "amountOverrideReason")) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" DROP COLUMN "amountOverrideReason"`);
    }

    if (await queryRunner.hasColumn("gaming_bookings", "extraMemberCharge")) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" DROP COLUMN "extraMemberCharge"`);
    }

    if (await queryRunner.hasColumn("gaming_bookings", "extraMemberCount")) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" DROP COLUMN "extraMemberCount"`);
    }

    if (await queryRunner.hasColumn("gaming_bookings", "systemCalculatedAmount")) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" DROP COLUMN "systemCalculatedAmount"`);
    }
  }
}
