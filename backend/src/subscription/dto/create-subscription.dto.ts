import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class CreateSubscriptionPricingMatrixBandDto {
  @IsNumber()
  @Type(() => Number)
  minTurnover!: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsNumber()
  @Type(() => Number)
  maxTurnover?: number | null;

  @IsNumber()
  @Type(() => Number)
  price!: number;
}

export class CreateSubscriptionRuleDto {
  @IsBoolean()
  @Type(() => Boolean)
  extendable!: boolean;

  /** Required when `extendable` is true; ignored (stored as 0) when false. */
  @ValidateIf((o: CreateSubscriptionRuleDto) => o.extendable === true)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  incrementStep?: number;

  @ValidateIf((o: CreateSubscriptionRuleDto) => o.extendable === true)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  incrementCost?: number;
}

export class CreateSubscriptionLimitsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  freePayrollLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  freePayrollUsers?: number;
}

/** Saved to `plan_addons` (one row per plan). */
export class CreateSubscriptionAddonsDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  vatPercent!: number;

  @IsBoolean()
  @Type(() => Boolean)
  taxFilingVatEnabled!: boolean;

  @IsBoolean()
  @Type(() => Boolean)
  dormantEnabled!: boolean;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  dormantCost!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  extraEmployeeCost!: number;
}

/** `POST /api/subscriptions` body — creates `plans`, matrix, rules, limit, optional add-ons. */
export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /** One or more customer types (canonical names or aliases, e.g. `limited`, `Solo`). */
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  customerTypes!: string[];

  @IsString()
  @IsNotEmpty()
  billingCycle!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsNumber()
  @Type(() => Number)
  maxTurnover?: number | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubscriptionPricingMatrixBandDto)
  pricingMatrix!: CreateSubscriptionPricingMatrixBandDto[];

  @ValidateNested()
  @Type(() => CreateSubscriptionRuleDto)
  rules!: CreateSubscriptionRuleDto;

  @ValidateNested()
  @Type(() => CreateSubscriptionLimitsDto)
  limits!: CreateSubscriptionLimitsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateSubscriptionAddonsDto)
  addons?: CreateSubscriptionAddonsDto;
}
