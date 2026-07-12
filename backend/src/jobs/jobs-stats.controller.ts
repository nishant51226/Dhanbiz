import { Controller, Get, UseGuards } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionResource } from "../auth/permission-resource.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { Job, JobStatus } from "../entities/job.entity";

/**
 * Static job stats routes on `/api/jobs/*` — separate controller so nestjsx CRUD
 * does not register `GET /jobs/:id` ahead of `counts-by-status`.
 */
@Controller("jobs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@PermissionResource("job")
export class JobsStatsController {
  constructor(@InjectRepository(Job) private readonly jobRepo: Repository<Job>) {}

  @Get("counts-by-status")
  async countsByStatus() {
    const rows = await this.jobRepo
      .createQueryBuilder("job")
      .where("job.document_id IS NOT NULL")
      .select("job.status", "status")
      .addSelect("COUNT(*)", "cnt")
      .groupBy("job.status")
      .getRawMany<{ status: string; cnt: string }>();

    const counts: Record<JobStatus, number> = {
      [JobStatus.queued]: 0,
      [JobStatus.processing]: 0,
      [JobStatus.completed]: 0,
      [JobStatus.failed]: 0,
      [JobStatus.cancelled]: 0,
    };
    let total = 0;
    for (const row of rows) {
      const n = Number.parseInt(row.cnt, 10) || 0;
      total += n;
      const st = row.status as JobStatus;
      if (st in counts) {
        counts[st] = n;
      }
    }
    return {
      queued: counts[JobStatus.queued],
      processing: counts[JobStatus.processing],
      completed: counts[JobStatus.completed],
      failed: counts[JobStatus.failed],
      cancelled: counts[JobStatus.cancelled],
      total,
    };
  }
}
