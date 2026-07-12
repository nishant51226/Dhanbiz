import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { RegisterPayload } from "../types/register.types";

export class RegisterDto implements RegisterPayload {
  @ApiProperty({ example: "asdf@asdf.com", format: "email" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Asdf" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @ApiProperty({ example: "Annual accounts & cooperation tax" })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  interest!: string;

  @ApiProperty({ example: "9989898989", description: "Local number or full number if no separate country code." })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone!: string;

  @ApiPropertyOptional({
    example: "+44",
    description: "Optional calling code; combined with `phone` in emails. Alias: `country_code`.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  phoneCountryCode?: string;

  @ApiPropertyOptional({
    example: "+44",
    description: "Same as `phoneCountryCode` (snake_case for JSON clients). Stored as `country_code` on enquiry.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  country_code?: string;

  @ApiPropertyOptional({
    example: "minimum-8-chars",
    description: "Optional; if omitted a server-generated password is used for account creation.",
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password?: string;
}
