import { MigrationInterface, QueryRunner } from "typeorm";

/** Notify accountants when a library document is assigned to them. */
export class FileAssignedNotificationEvent1750180000000 implements MigrationInterface {
  name = "FileAssignedNotificationEvent1750180000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "notification_event_configs" (
        "event_key", "label", "description", "trigger_type",
        "title_template", "body_template", "default_link_url",
        "available_placeholders", "sort_order", "push_enabled", "in_app_enabled"
      ) VALUES (
        'file.assigned',
        'File assigned',
        'Fires when a Super Admin or Manager assigns a library document to an accountant.',
        'event',
        'File assigned to you',
        '{{fileName}} for {{customerName}} was assigned to you.',
        '/files/documents/{{documentId}}',
        '["customerName","fileName","customerId","fileId","documentId"]'::jsonb,
        15,
        true,
        true
      )
      ON CONFLICT ("event_key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "notification_event_configs"
      WHERE "event_key" = 'file.assigned'
    `);
  }
}
