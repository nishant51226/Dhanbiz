import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EnquiryUserEntity } from "../entities/enquiry-user.entity";
import { EnquiryMailService } from "./enquiry-mail.service";

@Module({
  imports: [TypeOrmModule.forFeature([EnquiryUserEntity])],
  providers: [EnquiryMailService],
  exports: [EnquiryMailService],
})
export class EnquiryModule {}
