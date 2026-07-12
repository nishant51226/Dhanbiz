import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Idempotent seed for `customer_type` (Solo, Partnership, Limited Company).
 * Use when `ReplacePlanTablesWithCustomerTypePlansMatrix1747300000000` already ran before seed SQL was added,
 * or when the table exists but rows are missing.
 */
export class SeedCustomerTypesIfMissing1747310000000 implements MigrationInterface {
  name = "SeedCustomerTypesIfMissing1747310000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: { exists: boolean }[] = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'customer_type'
      ) AS "exists"
    `);
    if (!rows[0]?.exists) {
      return;
    }

    await queryRunner.query(`
      INSERT INTO "customer_type" ("id", "name")
      SELECT v.id::uuid, v.name
      FROM (
        VALUES
          ('c0000001-0000-4000-8000-000000000001', 'Solo'),
          ('c0000001-0000-4000-8000-000000000002', 'Partnership'),
          ('c0000001-0000-4000-8000-000000000003', 'Limited Company')
      ) AS v(id, name)
      WHERE NOT EXISTS (SELECT 1 FROM "customer_type" t WHERE t.name = v.name)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "customer_type"
      WHERE "id" IN (
        'c0000001-0000-4000-8000-000000000001',
        'c0000001-0000-4000-8000-000000000002',
        'c0000001-0000-4000-8000-000000000003'
      )
    `);
  }
}
