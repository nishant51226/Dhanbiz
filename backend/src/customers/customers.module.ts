import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CustomerFormSubmissionEntity } from "../entities/customer-form-submission.entity";
import { CustomerUserEntity } from "../entities/customer-user.entity";
import { Customer } from "../entities/customer.entity";
import { RoleEntity } from "../entities/role.entity";
import { PlansEntity } from "../entities/plans.entity";
import { UserEntity } from "../entities/user.entity";
import { UserRoleEntity } from "../entities/user-role.entity";
import { File } from "../entities/file.entity";
import { InvoiceEntity } from "../entities/invoice.entity";
import { InvoiceLineEntity } from "../entities/invoice-line.entity";
import { StatementEntity } from "../entities/statement.entity";
import { AuthModule } from "../auth/auth.module";
import { DocusealModule } from "../docuseal/docuseal.module";
import { CustomerFinancialsController } from "./customer-financials.controller";
import { CustomerFinancialsService } from "./customer-financials.service";
import { CustomerFormSubmissionsController } from "./customer-form-submissions.controller";
import { CustomerOnboardingS3Service } from "./customer-onboarding-s3.service";
import { OnboardingHtmlPdfService } from "./onboarding-html-pdf.service";
import { OnboardingPdfSignatureHydrateService } from "./onboarding-pdf-signature-hydrate.service";
import { CustomerFormSubmissionsService } from "./customer-form-submissions.service";
import { CompaniesHouseModule } from "../companies-house/companies-house.module";
import { NotificationModule } from "../notification/notification.module";
import { CompanyLookupController } from "./company-lookup.controller";
import { CustomersPageController } from "./customers-page.controller";
import { CustomersPageService } from "./customers-page.service";
import { CustomerPortalUserController } from "./customer-portal-user.controller";
import { CustomerPortalUserService } from "./customer-portal-user.service";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { StaffCustomerAssignmentSyncService } from "./staff-customer-assignment-sync.service.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      PlansEntity,
      CustomerFormSubmissionEntity,
      File,
      InvoiceEntity,
      InvoiceLineEntity,
      StatementEntity,
      UserEntity,
      RoleEntity,
      UserRoleEntity,
      CustomerUserEntity,
    ]),
    AuthModule,
    DocusealModule,
    CompaniesHouseModule,
    NotificationModule,
  ],
  controllers: [
    CustomersPageController,
    CustomerFinancialsController,
    CustomersController,
    CustomerPortalUserController,
    CompanyLookupController,
    CustomerFormSubmissionsController,
  ],
  providers: [
    CustomersService,
    CustomersPageService,
    CustomerFinancialsService,
    CustomerFormSubmissionsService,
    OnboardingHtmlPdfService,
    OnboardingPdfSignatureHydrateService,
    CustomerOnboardingS3Service,
    CustomerPortalUserService,
    StaffCustomerAssignmentSyncService,
  ],
  exports: [StaffCustomerAssignmentSyncService],
})
export class CustomersModule {}
