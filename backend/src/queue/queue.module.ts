import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { Job } from "../entities/job.entity";
import { ExtractModule } from "../extract/extract.module";
import { QueueDashboardController } from "./queue-dashboard.controller";
import { QueueService } from "./queue.service";
import { FileActivityModule } from "../file-activity/file-activity.module.js";

@Module({
  imports: [TypeOrmModule.forFeature([Job]), AuthModule, ExtractModule, FileActivityModule],
  controllers: [QueueDashboardController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
