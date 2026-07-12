import { Type } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsUUID } from "class-validator";

/** Body for `POST /api/subscriptions/services/plans/:planId/link` — link an existing catalogue row to the plan. */
export class AttachServiceToPlanDto {
  @IsUUID()
  serviceId!: string;

  @IsBoolean()
  @Type(() => Boolean)
  isIncluded!: boolean;
}
