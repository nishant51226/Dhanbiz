import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { AdminFolderScope } from "./create-admin-folder.dto";

export class AdminDefaultFolderQueryDto {
  @IsEnum(AdminFolderScope)
  scope!: AdminFolderScope;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}

export class SetAdminDefaultFolderDto {
  @IsEnum(AdminFolderScope)
  scope!: AdminFolderScope;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsUUID()
  folderId!: string;
}
