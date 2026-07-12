import { ApiPropertyOptional } from "@nestjs/swagger";

export class LogoutDto {
  @ApiPropertyOptional({ description: "Refresh token to revoke for this device/session" })
  refreshToken?: string;
}
