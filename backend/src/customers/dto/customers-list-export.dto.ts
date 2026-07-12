import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { CUSTOMERS_EXPORT_ALLOWED_COLUMN_KEYS } from "../customers-list-export.constants";

const FORMATS = ["csv", "xlsx"] as const;
const FORM_STATUSES = ["all", "draft", "completed"] as const;
const ACCOUNT_STATUSES = ["all", "draft", "active", "inactive", "proposed"] as const;

const allowedColumns = [...CUSTOMERS_EXPORT_ALLOWED_COLUMN_KEYS];

export class CustomersListExportFiltersDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  search?: string;

  /** Inclusive start: `YYYY-MM-DD` or ISO-8601 datetime. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  createdFrom?: string;

  /** Inclusive end: `YYYY-MM-DD` or ISO-8601 datetime. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  createdTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  updatedFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  updatedTo?: string;

  @IsOptional()
  @IsIn([...FORM_STATUSES])
  formStatus?: (typeof FORM_STATUSES)[number];

  @IsOptional()
  @IsIn([...ACCOUNT_STATUSES])
  accountStatus?: (typeof ACCOUNT_STATUSES)[number];

  /** When set, overrides `accountStatus` (e.g. `draft,active` for dashboard deadlines). */
  @IsOptional()
  @IsArray()
  @IsIn(["draft", "active", "inactive", "proposed"], { each: true })
  accountStatusIn?: Array<Exclude<(typeof ACCOUNT_STATUSES)[number], "all">>;
}

export class CustomersListExportBodyDto {
  @IsIn([...FORMATS])
  format!: (typeof FORMATS)[number];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsIn(allowedColumns, { each: true })
  /** Legacy list keys (e.g. `status`, `email`) are accepted and mapped to summary columns on export. */
  columns!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomersListExportFiltersDto)
  filters?: CustomersListExportFiltersDto;
}
