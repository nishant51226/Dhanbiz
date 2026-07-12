import { Module } from "@nestjs/common";
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AiModule } from "./ai/ai.module";
import { AuthModule } from "./auth/auth.module";
import { ExtractConfigController } from "./config/extract-config.controller";
import { CustomersModule } from "./customers/customers.module";
import { CustomerPortalModule } from "./customer-portal/customer-portal.module";
import { ExtractionSegmentEntity } from "./entities/extraction-segment.entity";
import { File } from "./entities/file.entity";
import { FinancialDocumentEntity } from "./entities/financial-document.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineEntity } from "./entities/invoice-line.entity";
import { StatementEntity } from "./entities/statement.entity";
import { StatementLineEntity } from "./entities/statement-line.entity";
import { CustomerFormSubmissionEntity } from "./entities/customer-form-submission.entity";
import { Customer } from "./entities/customer.entity";
import { DocumentEntity } from "./entities/document.entity";
import { DocumentAssigneeEntity } from "./entities/document-assignee.entity";
import { FolderEntity } from "./entities/folder.entity";
import { FolderDefaultEntity } from "./entities/folder-default.entity";
import { FolderRestrictedEntity } from "./entities/folder-restricted.entity";
import { SupplierEntity } from "./entities/supplier.entity";
import { Job } from "./entities/job.entity";
import { ExtractModule } from "./extract/extract.module";
import { HealthController } from "./health.controller";
import { JobsModule } from "./jobs/jobs.module";
import { ReportsModule } from "./reports/reports.module";
import { DocumentsModule } from "./documents/documents.module";
import { FilesModule } from "./files/files.module";
import { LegacyModule } from "./legacy/legacy.module";
import { DocusealModule } from "./docuseal/docuseal.module";
import { AdminModule } from "./admin/admin.module";
import { CronModule } from './cron/cron.module';
import { NotificationModule } from "./notification/notification.module";
import { SubscriptionModule } from "./subscription/subscription.module";
import { SubscriptionPlansModule } from "./subscription-plans/subscription-plans.module";
import { AiExecutionEntity } from "./entities/ai-execution.entity";
import { AiPricingEntity } from "./entities/ai-pricing.entity";
import { UserEntity } from "./entities/user.entity";
import { RoleEntity } from "./entities/role.entity";
import { StaffCustomerAssignmentEntity } from "./entities/staff-customer-assignment.entity";
import { CustomerUserEntity } from "./entities/customer-user.entity";
import { UserRoleEntity } from "./entities/user-role.entity";
import { RlsTenantInterceptor } from "./auth/rls-tenant.interceptor";
import { CustomerTypeEntity } from "./entities/customer-type.entity";
import { PlanAddonsEntity } from "./entities/plan-addons.entity";
import { PlanLimitEntity } from "./entities/plan-limit.entity";
import { PlanServiceEntity } from "./entities/plan-service.entity";
import { ServiceEntity } from "./entities/service.entity";
import { PlanPricingMatrixEntity } from "./entities/plan-pricing-matrix.entity";
import { PlanRulesEntity } from "./entities/plan-rules.entity";
import { PlansEntity } from "./entities/plans.entity";
import { SubscriptionPlan } from "./entities/subscription-plan.entity";
import { S3Module } from "./s3/s3.module";
import { MailModule } from "./mail/mail.module";
import { EnquiryUserEntity } from "./entities/enquiry-user.entity";
import { NotificationEventAudienceEntity } from "./entities/notification-event-audience.entity";
import { NotificationEventConfigEntity } from "./entities/notification-event-config.entity";
import { UserDeviceTokenEntity } from "./entities/user-device-token.entity";
import { RefreshTokenEntity } from "./entities/refresh-token.entity";
import { UserNotificationEntity } from "./entities/user-notification.entity";
import { NotificationGroupEntity } from "./entities/notification-group.entity";
import { DeadlineCampaignEntity } from "./entities/deadline-campaign.entity";
import { DeadlineCampaignAudienceEntity } from "./entities/deadline-campaign-audience.entity";
import { DeadlineCampaignSendEntity } from "./entities/deadline-campaign-send.entity";
import { NotificationGroupMemberEntity } from "./entities/notification-group-member.entity";
import { NotificationGroupRuleEntity } from "./entities/notification-group-rule.entity";
import { LibraryExportJobEntity } from "./entities/library-export-job.entity";
import { CustomerDocumentsExportJobEntity } from "./entities/customer-documents-export-job.entity";
import { FileActivityLogEntity } from "./entities/file-activity-log.entity";
import { typeormMigrations } from "./typeorm-migrations.registry";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    S3Module,
    MailModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>("DATABASE_URL");
        if (!url) {
          throw new Error("DATABASE_URL is required");
        }
        return {
          type: "postgres",
          url,
          // Pool tuning (pg driver)
          extra: {
            // Max concurrent pooled connections from this app instance
            max: Number(cfg.get("DB_POOL_MAX") ?? 20),
            // How long a client is allowed to remain idle before being closed
            idleTimeoutMillis: Number(cfg.get("DB_POOL_IDLE_MS") ?? 30000),
            // How long to wait for a new connection from the pool before timing out
            connectionTimeoutMillis: Number(cfg.get("DB_POOL_CONNECT_MS") ?? 5000),
          },
          entities: [
            Customer,
            CustomerFormSubmissionEntity,
            File,
            Job,
            FinancialDocumentEntity,
            ExtractionSegmentEntity,
            InvoiceEntity,
            InvoiceLineEntity,
            StatementEntity,
            StatementLineEntity,
            AiExecutionEntity,
            AiPricingEntity,
            UserEntity,
            RoleEntity,
            UserRoleEntity,
            CustomerUserEntity,
            StaffCustomerAssignmentEntity,
            SubscriptionPlan,
            CustomerTypeEntity,
            PlansEntity,
            PlanPricingMatrixEntity,
            PlanRulesEntity,
            PlanAddonsEntity,
            PlanLimitEntity,
            ServiceEntity,
            PlanServiceEntity,
            FolderEntity,
            FolderDefaultEntity,
            FolderRestrictedEntity,
            DocumentEntity,
            SupplierEntity,
            DocumentAssigneeEntity,
            EnquiryUserEntity,
            UserDeviceTokenEntity,
            RefreshTokenEntity,
            NotificationEventConfigEntity,
            NotificationEventAudienceEntity,
            UserNotificationEntity,
            NotificationGroupEntity,
            NotificationGroupMemberEntity,
            NotificationGroupRuleEntity,
            DeadlineCampaignEntity,
            DeadlineCampaignAudienceEntity,
            DeadlineCampaignSendEntity,
            LibraryExportJobEntity,
            CustomerDocumentsExportJobEntity,
            FileActivityLogEntity,
          ],
          synchronize: false,
          migrations: [...typeormMigrations],
          // Run migrations via dedicated admin-powered runner (see src/scripts/migrate.ts)
          migrationsRun: false,
        };
      },
    }),
    AuthModule,
    AiModule,
    ExtractModule,
    CustomersModule,
    CustomerPortalModule,
    FilesModule,
    JobsModule,
    ReportsModule,
    DocumentsModule,
    LegacyModule,
    DocusealModule,
    SubscriptionPlansModule,
    SubscriptionModule,
    AdminModule,
    CronModule,
    NotificationModule,
  ],
  controllers: [HealthController, ExtractConfigController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RlsTenantInterceptor,
    },
  ],
})
export class AppModule {}
