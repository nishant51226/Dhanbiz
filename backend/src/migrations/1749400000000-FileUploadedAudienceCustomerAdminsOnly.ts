import { MigrationInterface, QueryRunner } from "typeorm";

/** File upload notifications go to customer admins only (not all portal users). */
export class FileUploadedAudienceCustomerAdminsOnly1749400000000 implements MigrationInterface {
  name = "FileUploadedAudienceCustomerAdminsOnly1749400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "notification_event_audiences" a
      USING "notification_event_configs" c
      WHERE a."event_config_id" = c.id
        AND c."event_key" = 'file.uploaded'
        AND a."audience_type" = 'context_customer_portal_users'
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
      INSERT INTO "notification_event_audiences" ("event_config_id", "audience_type", "role_id")
      SELECT c.id, 'context_customer_portal_users', NULL
      FROM "notification_event_configs" c
      WHERE c."event_key" = 'file.uploaded'
        AND NOT EXISTS (
          SELECT 1 FROM "notification_event_audiences" a
          WHERE a."event_config_id" = c.id
            AND a."audience_type" = 'context_customer_portal_users'
        )
    `);
  }
}
