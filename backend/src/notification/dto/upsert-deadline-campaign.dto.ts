import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { NotificationAudienceDto } from "./notification-audience.dto";

const SCHEDULE_MODES = ["once", "daily_once", "daily_multi"] as const;

export class UpsertDeadlineCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  date_field_id!: string;

  @ApiProperty({ enum: SCHEDULE_MODES })
  @IsIn(SCHEDULE_MODES)
  schedule_mode!: (typeof SCHEDULE_MODES)[number];

  @ApiPropertyOptional({ description: "First send time UK, HH:MM" })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  send_start_time?: string;

  @ApiPropertyOptional({ description: "How many times per day (daily_multi)" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  send_count_per_day?: number;

  @ApiPropertyOptional({ description: "Hours between sends (daily_multi)" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(23)
  send_interval_hours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  upcoming_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3660)
  upcoming_lead_days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  overdue_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3660)
  overdue_lead_days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  default_link_url?: string | null;

  @ApiProperty({ type: [NotificationAudienceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationAudienceDto)
  audiences!: NotificationAudienceDto[];

  @ApiPropertyOptional({ type: [String], format: "uuid" })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  group_ids?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  push_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  in_app_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sort_order?: number;
}

export class PreviewDeadlineCampaignDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  campaign_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertDeadlineCampaignDto)
  draft?: UpsertDeadlineCampaignDto;
}
