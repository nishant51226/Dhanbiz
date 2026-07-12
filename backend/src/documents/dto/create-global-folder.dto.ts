import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { FolderLibraryKind } from "../../entities/folder.entity";

/** Body for `POST /folders/global`: library kind + folder name (+ optional tree parent). */
export class CreateGlobalFolderDto {
  @IsString()
  @MaxLength(1024)
  name!: string;

  @IsEnum(FolderLibraryKind)
  type!: FolderLibraryKind;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
