import { MigrationInterface, QueryRunner } from "typeorm";
import { computeProcessingDurationMs, parseDiagnosticLogTimes } from "../jobs/job-timing.util.js";

export class AddJobProcessingDurationMs1750280000000 implements MigrationInterface {
  name = "AddJobProcessingDurationMs1750280000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "jobs"
        ADD COLUMN IF NOT EXISTS "processing_duration_ms" INTEGER NULL
    `);

    const rows = (await queryRunner.query(`
      SELECT id, status, started_at AS "startedAt", completed_at AS "completedAt", result
      FROM "jobs"
      WHERE status IN ('completed', 'failed', 'cancelled')
        AND deleted_at IS NULL
    `)) as Array<{
      id: string;
      status: string;
      startedAt: Date | null;
      completedAt: Date | null;
      result: Record<string, unknown> | null;
    }>;

    for (const row of rows) {
      let startedAt = row.startedAt ? new Date(row.startedAt) : null;
      let completedAt = row.completedAt ? new Date(row.completedAt) : null;

      const fromLog = parseDiagnosticLogTimes(row.result);
      if (!startedAt && fromLog) startedAt = fromLog.start;
      if (!completedAt && fromLog) completedAt = fromLog.end;

      const processingDurationMs = computeProcessingDurationMs({
        startedAt,
        completedAt,
        result: row.result,
      });

      if (!startedAt && !completedAt && processingDurationMs == null) continue;

      await queryRunner.query(
        `UPDATE "jobs"
         SET started_at = COALESCE(started_at, $2::timestamptz),
             completed_at = COALESCE(completed_at, $3::timestamptz),
             processing_duration_ms = COALESCE(processing_duration_ms, $4::integer)
         WHERE id = $1::uuid`,
        [row.id, startedAt, completedAt, processingDurationMs],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN IF EXISTS "processing_duration_ms"`);
  }
}
