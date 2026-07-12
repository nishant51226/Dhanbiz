import { MigrationInterface, QueryRunner } from "typeorm";

export class AiExecutionsAndPricing1730900000000 implements MigrationInterface {
  name = "AiExecutionsAndPricing1730900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_pricing" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "provider" character varying(32) NOT NULL,
        "model" character varying(256) NOT NULL,
        "input_token_price" numeric(18, 8) NOT NULL,
        "output_token_price" numeric(18, 8) NOT NULL,
        "currency" character varying(8) NOT NULL DEFAULT 'USD',
        "effective_until" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_pricing" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_pricing_provider_model" ON "ai_pricing" ("provider", "model")`
    );

    await queryRunner.query(`
      CREATE TABLE "ai_executions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "segment_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "method" character varying(32) NOT NULL,
        "provider" character varying(32) NOT NULL,
        "model" character varying(256) NOT NULL,
        "input_tokens" integer,
        "output_tokens" integer,
        "total_tokens" integer,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_executions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_executions_segment" FOREIGN KEY ("segment_id") REFERENCES "extraction_segments"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_ai_executions_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ai_executions_segment" ON "ai_executions" ("segment_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_ai_executions_customer" ON "ai_executions" ("customer_id")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_extraction_segments_job_pipeline" ON "extraction_segments" ("job_id", "pipeline_segment_id")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_extraction_segments_job_pipeline"`);
    await queryRunner.query(`DROP TABLE "ai_executions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ai_pricing_provider_model"`);
    await queryRunner.query(`DROP TABLE "ai_pricing"`);
  }
}
