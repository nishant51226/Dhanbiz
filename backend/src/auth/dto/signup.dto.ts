import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SignupDto {
  @ApiProperty({
    example: "you@example.com",
    description: "Account email (stored lowercased).",
    format: "email",
  })
  email!: string;

  @ApiProperty({
    example: "minimum-8-chars",
    description: "Password (minimum 8 characters).",
    format: "password",
    minLength: 8,
  })
  password!: string;

  @ApiPropertyOptional({
    example: "00000000-0000-4000-8000-000000000001",
    description: "Optional existing customers.id to associate the user.",
  })
  customerId?: string;

  @ApiPropertyOptional({
    example: "+15551234567",
    description: "Optional phone number.",
  })
  phoneNumber?: string;
}
