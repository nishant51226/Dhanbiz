import { Type } from "class-transformer";
import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";

/** Body for `PATCH /api/subscriptions/services/:serviceId`. */
export class UpdateCatalogServiceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;
}
