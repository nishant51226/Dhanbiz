import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { CustomerPortalModule } from "../customer-portal/customer-portal.module";
import { DocumentAssigneeEntity } from "../entities/document-assignee.entity";
import { FilesModule } from "../files/files.module";
import { QueueModule } from "../queue/queue.module";
import { NotificationModule } from "../notification/notification.module";
import { DocumentEntity } from "../entities/document.entity";
import { FolderEntity } from "../entities/folder.entity";
import { FolderDefaultEntity } from "../entities/folder-default.entity";
import { FolderRestrictedEntity } from "../entities/folder-restricted.entity";
import { Job } from "../entities/job.entity";
import { RoleEntity } from "../entities/role.entity";
import { UserEntity } from "../entities/user.entity";
import { UserRoleEntity } from "../entities/user-role.entity";
import { Customer } from "../entities/customer.entity";
import { LibraryExportJobEntity } from "../entities/library-export-job.entity";
import { DocumentsAdminController } from "./documents-admin.controller";
import { DocumentsAdminService } from "./documents-admin.service";
import { GlobalFoldersController } from "./global-folders.controller";
import { GlobalFoldersService } from "./global-folders.service";
import { JobsModule } from "../jobs/jobs.module";
import { LibraryExportService } from "./library-export.service";
import { FileActivityModule } from "../file-activity/file-activity.module.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocumentEntity,
      DocumentAssigneeEntity,
      FolderEntity,
      FolderDefaultEntity,
      FolderRestrictedEntity,
      Customer,
      Job,
      UserEntity,
      UserRoleEntity,
      RoleEntity,
      LibraryExportJobEntity,
    ]),
    AuthModule,
    forwardRef(() => CustomerPortalModule),
    FilesModule,
    QueueModule,
    NotificationModule,
    JobsModule,
    FileActivityModule,
  ],
  controllers: [DocumentsAdminController, GlobalFoldersController],
  providers: [DocumentsAdminService, GlobalFoldersService, LibraryExportService],
  exports: [DocumentsAdminService, LibraryExportService],
})
export class DocumentsModule {}
