import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { CreatePlanFeatureItemDto } from "./create-plan-feature-item.dto";
import { CreatePlanPricingDto } from "./create-plan-pricing.dto";
import { CreatePlanTurnoverRuleDto } from "./create-plan-turnover-rule.dto";

/** Payload for creating a `plan` plus related pricing, features, and turnover bands. */
export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsInt()
  sort_order!: number;

  @IsString()
  @IsNotEmpty()
  billing_cycle!: string;

  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePlanFeatureItemDto)
  plan_features?: CreatePlanFeatureItemDto[];

  @ValidateNested()
  @Type(() => CreatePlanPricingDto)
  plan_pricing!: CreatePlanPricingDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePlanTurnoverRuleDto)
  turnover_rules?: CreatePlanTurnoverRuleDto[];
}
