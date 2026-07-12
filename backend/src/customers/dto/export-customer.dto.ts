import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const FORMATS = ["csv", "xlsx"] as const;

export class ExportCustomerDto {
  @IsIn([...FORMATS])
  format!: (typeof FORMATS)[number];

  /** When omitted or empty, every flattened column is exported (same as GET …/export). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  columns?: string[];
}
