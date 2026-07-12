import { Type } from "class-transformer";
import { IsInt, IsNumber, Min } from "class-validator";

/** Values for `plan_pricing` (one row per plan). */
export class CreatePlanPricingDto {
  @Type(() => Number)
  @IsNumber()
  base_price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  free_payee_users!: number;

  @Type(() => Number)
  @IsNumber()
  per_extra_payee_cost!: number;
}
