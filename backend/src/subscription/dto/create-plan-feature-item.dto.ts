import { IsBoolean, IsNotEmpty, IsString } from "class-validator";

/** One row in `plan_features`: link a feature (by id or code) and whether it is included. */
export class CreatePlanFeatureItemDto {
  @IsString()
  @IsNotEmpty()
  feature!: string;

  @IsBoolean()
  isActive!: boolean;
}
