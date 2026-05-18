import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBusinessScopeColumns1778000000000 implements MigrationInterface {
  name = "AddBusinessScopeColumns1778000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn("suppliers", "section"))) {
      await queryRunner.query(
        `ALTER TABLE "suppliers" ADD "section" character varying(20) NOT NULL DEFAULT 'dip_and_dash'`
      );
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_suppliers_name_unique"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_suppliers_name_section_unique" ON "suppliers" ("name", "section")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_suppliers_section" ON "suppliers" ("section")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_purchase_orders_section_date" ON "purchase_orders" ("purchaseSection", "purchaseDate")`
    );

    if (!(await queryRunner.hasColumn("assets", "section"))) {
      await queryRunner.query(
        `ALTER TABLE "assets" ADD "section" character varying(20) NOT NULL DEFAULT 'dip_and_dash'`
      );
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_assets_name"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_assets_name_section" ON "assets" ("name", "section")`
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_assets_section" ON "assets" ("section")`);

    if (!(await queryRunner.hasColumn("coupons", "section"))) {
      await queryRunner.query(
        `ALTER TABLE "coupons" ADD "section" character varying(20) NOT NULL DEFAULT 'dip_and_dash'`
      );
    }
    await queryRunner.query(`ALTER TABLE "coupons" DROP CONSTRAINT IF EXISTS "UQ_d46eefa53cfb29b6227b32c053d"`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_coupons_section" ON "coupons" ("section")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_coupons_code_section_unique" ON "coupons" ("couponCode", "section")`
    );

    if (!(await queryRunner.hasColumn("customers", "section"))) {
      await queryRunner.query(
        `ALTER TABLE "customers" ADD "section" character varying(20) NOT NULL DEFAULT 'dip_and_dash'`
      );
      await queryRunner.query(`
        UPDATE "customers" customer
        SET "section" = 'gaming'
        WHERE (
          EXISTS (
            SELECT 1
            FROM "invoices" invoice
            WHERE invoice."customerId" = customer."id"
              AND invoice."orderType" = 'snooker'
          )
          OR EXISTS (
            SELECT 1
            FROM "gaming_bookings" booking
            WHERE booking."bookingType" = 'snooker'
              AND (
                regexp_replace(COALESCE(booking."primaryCustomerPhone", ''), '[^0-9+]', '', 'g') = customer."phone"
                OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(COALESCE(booking."customerGroup", '[]'::jsonb)) AS customer_member
                  WHERE regexp_replace(COALESCE(customer_member->>'phone', ''), '[^0-9+]', '', 'g') = customer."phone"
                )
              )
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "invoices" dip_invoice
          WHERE dip_invoice."customerId" = customer."id"
            AND dip_invoice."orderType" != 'snooker'
        )
      `);
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_phone_unique"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customers_phone_section_unique" ON "customers" ("phone", "section")`
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_customers_section" ON "customers" ("section")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_section"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_phone_section_unique"`);
    if (await queryRunner.hasColumn("customers", "section")) {
      await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "section"`);
    }
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customers_phone_unique" ON "customers" ("phone")`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupons_code_section_unique"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupons_section"`);
    if (await queryRunner.hasColumn("coupons", "section")) {
      await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "section"`);
    }
    await queryRunner.query(
      `ALTER TABLE "coupons" ADD CONSTRAINT "UQ_d46eefa53cfb29b6227b32c053d" UNIQUE ("couponCode")`
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_assets_section"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_assets_name_section"`);
    if (await queryRunner.hasColumn("assets", "section")) {
      await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN "section"`);
    }
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_assets_name" ON "assets" ("name")`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_purchase_orders_section_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_suppliers_section"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_suppliers_name_section_unique"`);
    if (await queryRunner.hasColumn("suppliers", "section")) {
      await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "section"`);
    }
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_suppliers_name_unique" ON "suppliers" ("name")`);
  }
}
