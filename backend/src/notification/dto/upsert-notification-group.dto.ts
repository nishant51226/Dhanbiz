import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import type { NotificationGroupRuleFilter } from "../../entities/notification-group-rule.entity";
import { RECIPIENT_USER_FILTERS } from "../broadcast-recipient-user.resolver";

export class NotificationGroupRuleDto {
  @ApiProperty({ enum: RECIPIENT_USER_FILTERS })
  @IsIn(RECIPIENT_USER_FILTERS)
  filter!: NotificationGroupRuleFilter;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID("4")
  customer_id?: string | null;
}

export class UpsertNotificationGroupDto {
  @ApiProperty({ example: "VIP clients" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ type: [String], format: "uuid" })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  user_ids?: string[];

  @ApiPropertyOptional({ type: [NotificationGroupRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationGroupRuleDto)
  rules?: NotificationGroupRuleDto[];
}
