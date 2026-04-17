import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPendingPaymentHistories1776500000000 implements MigrationInterface {
  name = "AddPendingPaymentHistories1776500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("pending_payment_histories");
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE "pending_payment_histories" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "sourceType" character varying(24) NOT NULL,
          "sourceId" uuid NOT NULL,
          "sourceNumber" character varying(64) NOT NULL,
          "customerName" character varying(120) NOT NULL,
          "customerPhone" character varying(24) NOT NULL,
          "mode" character varying(20) NOT NULL,
          "amount" numeric(12,2) NOT NULL DEFAULT '0',
          "remainingAmount" numeric(12,2) NOT NULL DEFAULT '0',
          "referenceNo" character varying(120),
          "note" character varying(400),
          "collectedByUserId" uuid,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_pending_payment_histories_id" PRIMARY KEY ("id")
        )
      `);
    }

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pending_payment_histories_source"
      ON "pending_payment_histories" ("sourceType", "sourceId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pending_payment_histories_customer_phone"
      ON "pending_payment_histories" ("customerPhone")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pending_payment_histories_created_at"
      ON "pending_payment_histories" ("createdAt")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_pending_payment_histories_collected_by'
        ) THEN
          ALTER TABLE "pending_payment_histories"
          ADD CONSTRAINT "FK_pending_payment_histories_collected_by"
          FOREIGN KEY ("collectedByUserId") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable("pending_payment_histories");
    if (!hasTable) {
      return;
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_pending_payment_histories_collected_by'
        ) THEN
          ALTER TABLE "pending_payment_histories" DROP CONSTRAINT "FK_pending_payment_histories_collected_by";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pending_payment_histories_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pending_payment_histories_customer_phone"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pending_payment_histories_source"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pending_payment_histories"`);
  }
}

