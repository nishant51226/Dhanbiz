import { Type } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

/** Body for `POST /api/subscriptions/services` — create a catalogue row (not linked to a plan). */
export class CreateCatalogServiceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

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
