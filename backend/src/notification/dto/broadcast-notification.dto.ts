import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { NotificationAudienceDto } from "./notification-audience.dto";

export const BROADCAST_PRESETS = [
  "portal_users",
  "customer_admins",
  "managers",
  "accountants",
  "practice_staff",
] as const;

export type BroadcastPreset = (typeof BROADCAST_PRESETS)[number];

export class BroadcastNotificationDto {
  @ApiProperty({ example: "Important update" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: "We will be performing maintenance this weekend." })
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image_url?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  link_url?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  in_app_enabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  push_enabled?: boolean;

  @ApiPropertyOptional({
    description: "Quick audience presets",
    enum: BROADCAST_PRESETS,
    example: ["portal_users", "managers"],
  })
  @IsOptional()
  @IsArray()
  @IsIn(BROADCAST_PRESETS, { each: true })
  presets?: BroadcastPreset[];

  @ApiPropertyOptional({ type: [NotificationAudienceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationAudienceDto)
  audiences?: NotificationAudienceDto[];

  @ApiPropertyOptional({
    description: "Send only to these user IDs (union with audience presets when both are set)",
    type: [String],
    format: "uuid",
  })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  user_ids?: string[];

  @ApiPropertyOptional({
    description: "Send to members of these custom notification groups (union with other targets)",
    type: [String],
    format: "uuid",
  })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  group_ids?: string[];
}
