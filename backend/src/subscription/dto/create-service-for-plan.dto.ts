import { Type } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

/** Body for `POST /api/subscriptions/services/plans/:planId` — create `services` row and `plan_service` link. */
export class CreateServiceForPlanDto {
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

  /** Stored on `plan_service.is_included` (included vs optional add-on for this plan). */
  @IsBoolean()
  @Type(() => Boolean)
  isIncluded!: boolean;
}
