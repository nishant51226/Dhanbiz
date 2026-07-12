import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminGuard } from "../admin/admin.guard";
import { AuthModule } from "../auth/auth.module";
import { Customer } from "../entities/customer.entity";
import { NotificationEventAudienceEntity } from "../entities/notification-event-audience.entity";
import { NotificationEventConfigEntity } from "../entities/notification-event-config.entity";
import { NotificationGroupEntity } from "../entities/notification-group.entity";
import { NotificationGroupMemberEntity } from "../entities/notification-group-member.entity";
import { NotificationGroupRuleEntity } from "../entities/notification-group-rule.entity";
import { DeadlineCampaignEntity } from "../entities/deadline-campaign.entity";
import { DeadlineCampaignAudienceEntity } from "../entities/deadline-campaign-audience.entity";
import { DeadlineCampaignSendEntity } from "../entities/deadline-campaign-send.entity";
import { RoleEntity } from "../entities/role.entity";
import { StaffCustomerAssignmentEntity } from "../entities/staff-customer-assignment.entity";
import { UserDeviceTokenEntity } from "../entities/user-device-token.entity";
import { UserNotificationEntity } from "../entities/user-notification.entity";
import { UserEntity } from "../entities/user.entity";
import { UserRoleEntity } from "../entities/user-role.entity";
import { CustomerUserEntity } from "../entities/customer-user.entity";
import { AdminNotificationBroadcastService } from "./admin-notification-broadcast.service";
import { AdminNotificationConfigController } from "./admin-notification-config.controller";
import { AdminNotificationConfigService } from "./admin-notification-config.service";
import { AdminNotificationGroupsController } from "./admin-notification-groups.controller";
import { AdminNotificationsController } from "./admin-notifications.controller";
import { AdminDeadlineCampaignController } from "./admin-deadline-campaign.controller";
import { BroadcastRecipientUserResolver } from "./broadcast-recipient-user.resolver";
import { NotificationAudienceResolver } from "./notification-audience.resolver";
import { FileUploadNotificationService } from "./file-upload-notification.service";
import { FileAssigneeNotificationService } from "./file-assignee-notification.service";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { NotificationController } from "./notification.controller";
import { NotificationGroupService } from "./notification-group.service";
import { DeadlineCampaignService } from "./deadline-campaign.service";
import { NotificationService } from "./notification.service";
import { NotificationsGateway } from "./notifications.gateway";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEventConfigEntity,
      NotificationEventAudienceEntity,
      UserNotificationEntity,
      UserDeviceTokenEntity,
      UserEntity,
      Customer,
      CustomerUserEntity,
      StaffCustomerAssignmentEntity,
      UserRoleEntity,
      RoleEntity,
      NotificationGroupEntity,
      NotificationGroupMemberEntity,
      NotificationGroupRuleEntity,
      DeadlineCampaignEntity,
      DeadlineCampaignAudienceEntity,
      DeadlineCampaignSendEntity,
    ]),
    AuthModule,
  ],
  controllers: [
    NotificationController,
    AdminNotificationConfigController,
    AdminNotificationsController,
    AdminNotificationGroupsController,
    AdminDeadlineCampaignController,
  ],
  providers: [
    NotificationService,
    NotificationDispatchService,
    FileUploadNotificationService,
    FileAssigneeNotificationService,
    NotificationAudienceResolver,
    BroadcastRecipientUserResolver,
    NotificationGroupService,
    AdminNotificationConfigService,
    AdminNotificationBroadcastService,
    DeadlineCampaignService,
    NotificationsGateway,
    AdminGuard,
  ],
  exports: [NotificationService, NotificationDispatchService, FileUploadNotificationService, FileAssigneeNotificationService, DeadlineCampaignService],
})
export class NotificationModule {}
