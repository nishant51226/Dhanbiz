import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

export class ListInboxQueryDto {
  @ApiPropertyOptional({ default: 30, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unread_only?: boolean;
}
