import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ExtractModule } from "../extract/extract.module";
import { LegacyExtractController } from "./legacy-extract.controller";

@Module({
  imports: [AuthModule, ExtractModule],
  controllers: [LegacyExtractController],
})
export class LegacyModule {}
