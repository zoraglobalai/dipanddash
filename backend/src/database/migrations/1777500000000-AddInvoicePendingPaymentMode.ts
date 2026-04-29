import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddInvoicePendingPaymentMode1777500000000 implements MigrationInterface {
  name = "AddInvoicePendingPaymentMode1777500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasInvoicesTable = await queryRunner.hasTable("invoices");
    if (!hasInvoicesTable) {
      return;
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public' AND t.typname = 'invoices_paymentmode_enum'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public'
            AND t.typname = 'invoices_paymentmode_enum'
            AND e.enumlabel = 'pending'
        ) THEN
          ALTER TYPE "public"."invoices_paymentmode_enum" ADD VALUE 'pending';
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasInvoicesTable = await queryRunner.hasTable("invoices");
    if (!hasInvoicesTable) {
      return;
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public'
            AND t.typname = 'invoices_paymentmode_enum'
            AND e.enumlabel = 'pending'
        ) THEN
          UPDATE "invoices"
          SET "paymentMode" = 'cash'
          WHERE "paymentMode" = 'pending';

          ALTER TYPE "public"."invoices_paymentmode_enum" RENAME TO "invoices_paymentmode_enum_old";
          CREATE TYPE "public"."invoices_paymentmode_enum" AS ENUM('cash', 'card', 'upi', 'mixed');

          ALTER TABLE "invoices"
          ALTER COLUMN "paymentMode" DROP DEFAULT;

          ALTER TABLE "invoices"
          ALTER COLUMN "paymentMode"
          TYPE "public"."invoices_paymentmode_enum"
          USING ("paymentMode"::text::"public"."invoices_paymentmode_enum");

          ALTER TABLE "invoices"
          ALTER COLUMN "paymentMode" SET DEFAULT 'cash';

          DROP TYPE "public"."invoices_paymentmode_enum_old";
        END IF;
      END
      $$;
    `);
  }
}
