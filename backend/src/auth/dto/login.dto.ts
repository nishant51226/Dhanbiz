import { ApiPropertyOptional } from "@nestjs/swagger";

export class LoginDto {
  @ApiPropertyOptional({
    example: "you@example.com",
    description: "Email for database-backed login (use with password).",
  })
  email?: string;

  @ApiPropertyOptional({
    example: "admin",
    description: "Username for legacy env-based login (use with password).",
  })
  username?: string;

  @ApiPropertyOptional({
    example: "your-password",
    description: "Password. Required with email or username when auth is enabled.",
    format: "password",
  })
  password?: string;
}
