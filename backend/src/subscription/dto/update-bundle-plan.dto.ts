import { Type } from "class-transformer";
import { IsBoolean } from "class-validator";

export class UpdateBundlePlanDto {
  @IsBoolean()
  @Type(() => Boolean)
  isActive!: boolean;
}
