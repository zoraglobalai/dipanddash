import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddGamingPaymentReference1777800000000 implements MigrationInterface {
  name = "AddGamingPaymentReference1777800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("gaming_bookings");
    if (!hasTable) {
      return;
    }

    if (!(await queryRunner.hasColumn("gaming_bookings", "paymentReference"))) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" ADD "paymentReference" varchar(120)`);
    }

    await queryRunner.query(`
      UPDATE "gaming_bookings"
      SET "paymentReference" = NULLIF(
        trim(regexp_replace(substring("note" from 'Txn Ref:[[:space:]]*[^|]+'), '^Txn Ref:[[:space:]]*', '', 'i')),
        ''
      )
      WHERE "paymentReference" IS NULL
        AND "note" ~* 'Txn Ref:[[:space:]]*[^|]+'
    `);

    await queryRunner.query(`
      UPDATE "gaming_bookings"
      SET "paymentReference" = NULLIF(
        trim(regexp_replace(substring("note" from 'UPI Ref:[[:space:]]*[^|]+'), '^UPI Ref:[[:space:]]*', '', 'i')),
        ''
      )
      WHERE "paymentReference" IS NULL
        AND "note" ~* 'UPI Ref:[[:space:]]*[^|]+'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("gaming_bookings");
    if (!hasTable) {
      return;
    }

    if (await queryRunner.hasColumn("gaming_bookings", "paymentReference")) {
      await queryRunner.query(`ALTER TABLE "gaming_bookings" DROP COLUMN "paymentReference"`);
    }
  }
}
