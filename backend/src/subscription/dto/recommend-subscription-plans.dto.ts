import { Transform, Type } from "class-transformer";
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

/** Body for `POST /api/subscriptions/recommend` — onboarding-style inputs. */
export class RecommendSubscriptionPlansDto {
  /** Canonical name or alias (`limited`, `Solo`, `Partnership`, …). */
  @IsString()
  @IsNotEmpty()
  customerType!: string;

  @IsString()
  @IsNotEmpty()
  billingCycle!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  turnover!: number;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  payeeUsers!: number;

  /** When true and the plan has dormant enabled, dormant fee is included in pricing. */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isDormant?: boolean;

  /**
   * When non-empty, only plans that link every listed catalogue `services.id` via `plan_service` are considered
   * (after customer type and billing cycle). All ids must be active services.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((x: unknown) => String(x).trim()).filter(Boolean))];
  })
  @IsArray()
  @IsUUID("4", { each: true })
  serviceIds?: string[];
}
