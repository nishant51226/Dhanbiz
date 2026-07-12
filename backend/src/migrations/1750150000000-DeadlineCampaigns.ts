import { MigrationInterface, QueryRunner } from "typeorm";

export class DeadlineCampaigns1750150000000 implements MigrationInterface {
  name = "DeadlineCampaigns1750150000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "deadline_campaigns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(128) NOT NULL,
        "date_field_id" character varying(80) NOT NULL,
        "schedule_mode" character varying(16) NOT NULL,
        "send_times" jsonb NOT NULL DEFAULT '[]',
        "upcoming_enabled" boolean NOT NULL DEFAULT true,
        "upcoming_lead_days" integer NOT NULL DEFAULT 30,
        "overdue_enabled" boolean NOT NULL DEFAULT true,
        "overdue_lead_days" integer NOT NULL DEFAULT 14,
        "upcoming_title_template" character varying(200) NOT NULL,
        "upcoming_body_template" text NOT NULL,
        "overdue_title_template" character varying(200) NOT NULL,
        "overdue_body_template" text NOT NULL,
        "default_link_url" character varying(512),
        "group_ids" jsonb NOT NULL DEFAULT '[]',
        "is_enabled" boolean NOT NULL DEFAULT true,
        "push_enabled" boolean NOT NULL DEFAULT true,
        "in_app_enabled" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deadline_campaigns" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deadline_campaigns_schedule_mode" CHECK (
          "schedule_mode" IN ('once', 'daily_once', 'daily_multi')
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "deadline_campaign_audiences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "audience_type" character varying(48) NOT NULL,
        "role_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deadline_campaign_audiences" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deadline_campaign_audiences_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "deadline_campaigns"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_deadline_campaign_audiences_role" FOREIGN KEY ("role_id")
          REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "CHK_deadline_campaign_audiences_type" CHECK (
          "audience_type" IN (
            'context_customer_portal_users',
            'context_customer_admins',
            'context_practice_staff_on_customer',
            'all_portal_users',
            'role',
            'all_practice_staff_with_role'
          )
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_deadline_campaign_audiences_campaign"
      ON "deadline_campaign_audiences" ("campaign_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "deadline_campaign_sends" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "due_date" date NOT NULL,
        "phase" character varying(16) NOT NULL,
        "send_date" date NOT NULL,
        "send_slot" character varying(8) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deadline_campaign_sends" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deadline_campaign_sends_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "deadline_campaigns"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_deadline_campaign_sends_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "CHK_deadline_campaign_sends_phase" CHECK (
          "phase" IN ('upcoming', 'overdue')
        )
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_deadline_campaign_sends_dedup"
      ON "deadline_campaign_sends" (
        "campaign_id", "customer_id", "due_date", "phase", "send_date", "send_slot"
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_deadline_campaign_sends_campaign"
      ON "deadline_campaign_sends" ("campaign_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "deadline_campaign_sends"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deadline_campaign_audiences"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deadline_campaigns"`);
  }
}
