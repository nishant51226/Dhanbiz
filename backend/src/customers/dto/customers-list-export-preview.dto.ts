import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { CUSTOMERS_EXPORT_ALLOWED_COLUMN_KEYS } from "../customers-list-export.constants";
import { CustomersListExportFiltersDto } from "./customers-list-export.dto";

const allowedColumns = [...CUSTOMERS_EXPORT_ALLOWED_COLUMN_KEYS];

/** Same filters + columns as export; returns sample rows and match list (no file). */
export class CustomersListExportPreviewBodyDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsIn(allowedColumns, { each: true })
  columns!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomersListExportFiltersDto)
  filters?: CustomersListExportFiltersDto;

  /** How many data rows to return in `previewRows` (max 100). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  previewRowLimit?: number;

  /** How many id+name pairs to return in `matchingCustomers` (max 200). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  matchingNameLimit?: number;
}
