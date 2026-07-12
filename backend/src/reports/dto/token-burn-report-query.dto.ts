import { IsISO8601, IsOptional, IsUUID } from "class-validator";

export class TokenBurnReportQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}
