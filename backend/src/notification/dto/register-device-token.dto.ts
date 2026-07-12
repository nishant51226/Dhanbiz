import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class RegisterDeviceTokenDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  user_id!: string;

  @ApiProperty({ description: "FCM registration token" })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(4096)
  firebase_token!: string;

  @ApiPropertyOptional({ example: "ios", description: "ios | android | web" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  device_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  device_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  app_version?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
