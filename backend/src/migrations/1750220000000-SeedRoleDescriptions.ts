import { MigrationInterface, QueryRunner } from "typeorm";

const ROLE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  manager:
    "Practice lead: customers, files, jobs, assignments, and creating customers. Full staff workspace access.",
  accountant:
    "Assigned customers only: read files and jobs. Cannot create customers or delete drive items.",
  customer_admin:
    "Portal administrator: files, settings, and organisation profile for one customer.",
  customer_user: "Portal user: view and upload files in the customer document library.",
};

/**
 * Backfill human-readable descriptions on system roles (editable later in Settings → Roles).
 */
export class SeedRoleDescriptions1750220000000 implements MigrationInterface {
  name = "SeedRoleDescriptions1750220000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    for (const [name, description] of Object.entries(ROLE_DESCRIPTIONS)) {
      await queryRunner.query(
        `
        UPDATE "roles"
        SET "description" = $2, "updated_at" = now()
        WHERE lower("name") = lower($1)
          AND ("description" IS NULL OR btrim("description") = '')
        `,
        [name, description],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("roles"))) return;

    for (const name of Object.keys(ROLE_DESCRIPTIONS)) {
      await queryRunner.query(
        `
        UPDATE "roles"
        SET "description" = NULL, "updated_at" = now()
        WHERE lower("name") = lower($1)
          AND "description" = $2
        `,
        [name, ROLE_DESCRIPTIONS[name]],
      );
    }
  }
}
