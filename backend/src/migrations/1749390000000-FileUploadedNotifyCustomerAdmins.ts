import { MigrationInterface, QueryRunner } from "typeorm";

export class FileUploadedNotifyCustomerAdmins1749390000000 implements MigrationInterface {
  name = "FileUploadedNotifyCustomerAdmins1749390000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notification_event_audiences"
      DROP CONSTRAINT IF EXISTS "CHK_notification_event_audiences_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "notification_event_audiences"
      ADD CONSTRAINT "CHK_notification_event_audiences_type" CHECK (
        "audience_type" IN (
          'context_customer_portal_users',
          'context_customer_admins',
          'context_practice_staff_on_customer',
          'all_portal_users',
          'role',
          'all_practice_staff_with_role'
        )
      )
    `);

    await queryRunner.query(`
      INSERT INTO "notification_event_audiences" ("event_config_id", "audience_type", "role_id")
      SELECT c.id, 'context_customer_admins', NULL
      FROM "notification_event_configs" c
      WHERE c."event_key" = 'file.uploaded'
        AND NOT EXISTS (
          SELECT 1 FROM "notification_event_audiences" a
          WHERE a."event_config_id" = c.id
            AND a."audience_type" = 'context_customer_admins'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "notification_event_audiences" a
      USING "notification_event_configs" c
      WHERE a."event_config_id" = c.id
        AND c."event_key" = 'file.uploaded'
        AND a."audience_type" = 'context_customer_admins'
    `);

    await queryRunner.query(`
      ALTER TABLE "notification_event_audiences"
      DROP CONSTRAINT IF EXISTS "CHK_notification_event_audiences_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "notification_event_audiences"
      ADD CONSTRAINT "CHK_notification_event_audiences_type" CHECK (
        "audience_type" IN (
          'context_customer_portal_users',
          'context_practice_staff_on_customer',
          'all_portal_users',
          'role',
          'all_practice_staff_with_role'
        )
      )
    `);
  }
}
