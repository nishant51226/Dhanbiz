import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { NotificationModule } from "../notification/notification.module.js";
import { QueueModule } from "../queue/queue.module.js";
import { S3Module } from "../s3/s3.module.js";
import { CustomerDocumentsExportJobEntity } from "../entities/customer-documents-export-job.entity.js";
import { Customer } from "../entities/customer.entity.js";
import { DocumentEntity } from "../entities/document.entity.js";
import { FinancialDocumentEntity } from "../entities/financial-document.entity.js";
import { FolderEntity } from "../entities/folder.entity.js";
import { InvoiceEntity } from "../entities/invoice.entity.js";
import { StatementEntity } from "../entities/statement.entity.js";
import { Job } from "../entities/job.entity.js";
import { File } from "../entities/file.entity.js";
import { SupplierEntity } from "../entities/supplier.entity.js";
import { ExtractModule } from "../extract/extract.module";
import { AdminReportFilesController } from "./admin-report-files.controller.js";
import { AdminReportsController } from "./admin-reports.controller.js";
import { CustomerDocumentsExportJobService } from "./customer-documents-export-job.service.js";
import { CustomerDocumentsReportService } from "./customer-documents-report.service.js";
import { ReportsController } from "./reports.controller.js";
import { FileActivityModule } from "../file-activity/file-activity.module.js";

@Module({
  imports: [
    AuthModule,
    FileActivityModule,
    ConfigModule,
    S3Module,
    QueueModule,
    NotificationModule,
    ExtractModule,
    TypeOrmModule.forFeature([
      CustomerDocumentsExportJobEntity,
      Customer,
      DocumentEntity,
      FolderEntity,
      FinancialDocumentEntity,
      InvoiceEntity,
      StatementEntity,
      SupplierEntity,
      Job,
      File,
    ]),
  ],
  controllers: [ReportsController, AdminReportsController, AdminReportFilesController],
  providers: [
    CustomerDocumentsReportService,
    CustomerDocumentsExportJobService,
  ],
  exports: [CustomerDocumentsExportJobService],
})
export class ReportsModule {}
