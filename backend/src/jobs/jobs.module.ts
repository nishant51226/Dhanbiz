import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { DocumentAssigneeEntity } from "../entities/document-assignee.entity";
import { Job } from "../entities/job.entity";
import { UserRoleEntity } from "../entities/user-role.entity";
import { ExtractModule } from "../extract/extract.module";
import { QueueModule } from "../queue/queue.module";
import { JobExtractionRequeueService } from "./job-extraction-requeue.service";
import { JobsStatsController } from "./jobs-stats.controller";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [TypeOrmModule.forFeature([Job, UserRoleEntity, DocumentAssigneeEntity]), AuthModule, QueueModule, ExtractModule],
  controllers: [JobsStatsController, JobsController],
  providers: [JobsService, JobExtractionRequeueService],
  exports: [JobsService, JobExtractionRequeueService],
})
export class JobsModule {}
