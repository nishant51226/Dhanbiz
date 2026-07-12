import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { NotificationAudienceDto } from "./notification-audience.dto";

export class UpsertNotificationConfigDto {
  @ApiProperty({ example: "file.uploaded" })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  event_key!: string;

  @ApiProperty({ example: "File uploaded" })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ enum: ["event", "manual"], default: "event" })
  @IsOptional()
  @IsIn(["event", "manual"])
  trigger_type?: "event" | "manual";

  @ApiProperty({ example: "New file: {{fileName}}" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title_template!: string;

  @ApiProperty({ example: "{{fileName}} was uploaded for {{customerName}}." })
  @IsString()
  @MinLength(1)
  body_template!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image_url_template?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  default_link_url?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  push_enabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  in_app_enabled?: boolean;

  @ApiPropertyOptional({ type: [String], example: ["customerName", "fileName"] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  available_placeholders?: string[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort_order?: number;

  @ApiProperty({ type: [NotificationAudienceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationAudienceDto)
  audiences!: NotificationAudienceDto[];
}
