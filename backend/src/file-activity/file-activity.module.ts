import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module.js";
import { Customer } from "../entities/customer.entity.js";
import { DocumentEntity } from "../entities/document.entity.js";
import { FileActivityLogEntity } from "../entities/file-activity-log.entity.js";
import { Job } from "../entities/job.entity.js";
import { AdminFileActivityReportController } from "./admin-file-activity-report.controller.js";
import { FileActivityLogService } from "./file-activity-log.service.js";
import { FileActivityReportService } from "./file-activity-report.service.js";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      FileActivityLogEntity,
      DocumentEntity,
      Customer,
      Job,
    ]),
  ],
  controllers: [AdminFileActivityReportController],
  providers: [FileActivityLogService, FileActivityReportService],
  exports: [FileActivityLogService, FileActivityReportService],
})
export class FileActivityModule {}
