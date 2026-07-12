import { ApiProperty } from "@nestjs/swagger";

export class RefreshDto {
  @ApiProperty({ description: "Opaque refresh token from login or prior refresh" })
  refreshToken!: string;
}
