import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { CustomerPortalModule } from "../customer-portal/customer-portal.module";
import { Customer } from "../entities/customer.entity";
import { DocumentEntity } from "../entities/document.entity";
import { File } from "../entities/file.entity";
import { Job } from "../entities/job.entity";
import { NotificationModule } from "../notification/notification.module";
import { QueueModule } from "../queue/queue.module";
import { DirectS3UploadService } from "./direct-s3-upload.service";
import { FilesController } from "./files.controller";
import { FilesSupplierPathService } from "./files-supplier-path.service";
import { FilesService } from "./files.service";
import { UploadController } from "./upload.controller";
import { FileActivityModule } from "../file-activity/file-activity.module.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, File, Job, DocumentEntity]),
    forwardRef(() => CustomerPortalModule),
    AuthModule,
    QueueModule,
    NotificationModule,
    FileActivityModule,
  ],
  controllers: [FilesController, UploadController],
  providers: [FilesService, FilesSupplierPathService, DirectS3UploadService],
  exports: [FilesService, FilesSupplierPathService, DirectS3UploadService],
})
export class FilesModule {}
