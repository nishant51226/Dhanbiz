import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsUUID } from "class-validator";
import type { NotificationAudienceType } from "../../entities/notification-event-audience.entity";

const AUDIENCE_TYPES = [
  "context_customer_portal_users",
  "context_customer_admins",
  "context_practice_staff_on_customer",
  "all_portal_users",
  "role",
  "all_practice_staff_with_role",
] as const satisfies readonly NotificationAudienceType[];

export class NotificationAudienceDto {
  @ApiProperty({ enum: AUDIENCE_TYPES })
  @IsIn(AUDIENCE_TYPES)
  audience_type!: NotificationAudienceType;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  role_id?: string | null;
}
