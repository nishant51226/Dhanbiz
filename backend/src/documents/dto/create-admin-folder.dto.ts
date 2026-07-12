import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { FolderLibraryKind } from "../../entities/folder.entity";

export enum AdminFolderScope {
  global = "global",
  customer = "customer",
}

/** Body for `POST /folders/admin`: create folder/supplier at global or customer scope. */
export class CreateAdminFolderDto {
  @IsString()
  @MaxLength(1024)
  name!: string;

  @IsOptional()
  @IsEnum(FolderLibraryKind)
  /** Omitted on unified admin UI; defaults to `files` until `folders.type` is removed from the schema. */
  type?: FolderLibraryKind;

  @IsEnum(AdminFolderScope)
  scope!: AdminFolderScope;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  customerIds?: string[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isRestricted?: boolean;
}
