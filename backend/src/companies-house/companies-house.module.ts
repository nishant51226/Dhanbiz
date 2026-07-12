import { Module } from "@nestjs/common";
import { CompaniesHouseService } from "./companies-house.service";

@Module({
  providers: [CompaniesHouseService],
  exports: [CompaniesHouseService],
})
export class CompaniesHouseModule {}
