import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { DocumentsModule } from "../documents/documents.module";
import { FilesModule } from "../files/files.module";
import { Customer } from "../entities/customer.entity";
import { DocumentEntity } from "../entities/document.entity";
import { FolderEntity } from "../entities/folder.entity";
import { FolderDefaultEntity } from "../entities/folder-default.entity";
import { File } from "../entities/file.entity";
import { Job } from "../entities/job.entity";
import { NotificationModule } from "../notification/notification.module";
import { QueueModule } from "../queue/queue.module";
import { CustomerPortalController } from "./customer-portal.controller";
import { CustomerPortalService } from "./customer-portal.service";
import { PortalFolderDocumentService } from "./portal-folder-document.service";
import { FileActivityModule } from "../file-activity/file-activity.module.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, File, Job, FolderEntity, FolderDefaultEntity, DocumentEntity]),
    forwardRef(() => FilesModule),
    AuthModule,
    forwardRef(() => DocumentsModule),
    QueueModule,
    NotificationModule,
    ConfigModule,
    FileActivityModule,
  ],
  controllers: [CustomerPortalController],
  providers: [CustomerPortalService, PortalFolderDocumentService],
  exports: [CustomerPortalService, PortalFolderDocumentService],
})
export class CustomerPortalModule {}
