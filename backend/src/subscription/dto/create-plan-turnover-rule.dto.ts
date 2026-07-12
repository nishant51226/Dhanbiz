import { Type } from "class-transformer";
import { IsNumber, IsOptional } from "class-validator";

/** One turnover band for `turnover_rules`; omit or null `max_turnover` for no upper cap. */
export class CreatePlanTurnoverRuleDto {
  @Type(() => Number)
  @IsNumber()
  min_turnover!: number;

  @IsOptional()
  @IsNumber()
  max_turnover?: number | null;
}
