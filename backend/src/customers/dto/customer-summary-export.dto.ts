import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString } from "class-validator";

const FORMATS = ["csv", "xlsx"] as const;

export class CustomerSummaryExportColumnsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(128)
  @IsString({ each: true })
  columns!: string[];
}

export class CustomerSummaryExportFileDto extends CustomerSummaryExportColumnsDto {
  @IsIn([...FORMATS])
  format!: (typeof FORMATS)[number];
}
