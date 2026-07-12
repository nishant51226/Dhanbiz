import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CustomerFormSubmissionEntity } from "../entities/customer-form-submission.entity";
import { Customer } from "../entities/customer.entity";
import { File } from "../entities/file.entity";
import { DocusealApiService } from "./docuseal-api.service";
import { DocusealRemoteSignatureService } from "./docuseal-remote-signature.service";
import { DocusealWebhookController } from "./docuseal-webhook.controller";
import { DocusealWebhookService } from "./docuseal-webhook.service";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([CustomerFormSubmissionEntity, Customer, File]),
  ],
  controllers: [DocusealWebhookController],
  providers: [DocusealApiService, DocusealRemoteSignatureService, DocusealWebhookService],
  exports: [DocusealApiService, DocusealRemoteSignatureService],
})
export class DocusealModule {}
