import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { getFirebaseMessaging } from "./firebase.provider";
import { Customer } from "../entities/customer.entity";
import { NotificationEventConfigEntity } from "../entities/notification-event-config.entity";
import { UserEntity } from "../entities/user.entity";
import { UserNotificationEntity } from "../entities/user-notification.entity";
import type { AudienceSpec } from "./notification-audience.types";
import { NotificationAudienceResolver, type NotificationDispatchContext } from "./notification-audience.resolver";
import { NotificationService } from "./notification.service";
import { NotificationsGateway } from "./notifications.gateway";
import { renderNotificationTemplate } from "./notification-template.util";

export type NotificationPushOutcome = "sent" | "noTokens" | "fcmDisabled" | "failed" | "skipped";

export type NotificationDeliveryRecipient = {
  userId: string;
  email: string;
  inApp: boolean;
  push: NotificationPushOutcome;
  deviceTokenCount: number;
};

export type NotificationDeliveryReport = {
  recipientCount: number;
  pushSummary: {
    sent: number;
    noTokens: number;
    fcmDisabled: number;
    failed: number;
    skipped: number;
  };
  recipients: NotificationDeliveryRecipient[];
};

export type BroadcastRecipientPreview = {
  userId: string;
  deviceTokenCount: number;
  pushEligible: boolean;
};

export type BroadcastPreviewReport = {
  recipientCount: number;
  fcmConfigured: boolean;
  pushSummary: {
    withTokens: number;
    withoutTokens: number;
  };
  recipients: BroadcastRecipientPreview[];
};

@Injectable()
export class NotificationDispatchService {
  private readonly log = new Logger(NotificationDispatchService.name);

  constructor(
    @InjectRepository(NotificationEventConfigEntity)
    private readonly eventConfigs: Repository<NotificationEventConfigEntity>,
    @InjectRepository(UserNotificationEntity)
    private readonly userNotifications: Repository<UserNotificationEntity>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly audienceResolver: NotificationAudienceResolver,
    private readonly deviceTokens: NotificationService,
    private readonly gateway: NotificationsGateway,
  ) {}

  /** Fire a configured event (e.g. `file.uploaded`, `customer.created`). */
  async dispatch(
    eventKey: string,
    context: NotificationDispatchContext,
  ): Promise<NotificationDeliveryReport> {
    const key = eventKey.trim();
    if (!key) return this.emptyDeliveryReport();

    const config = await this.eventConfigs.findOne({
      where: { eventKey: key, isEnabled: true },
      relations: { audiences: true },
    });
    if (!config) return this.emptyDeliveryReport();

    const vars = await this.buildTemplateVars(context);
    let recipientIds = await this.audienceResolver.resolveUserIds(config.audiences ?? [], vars);
    const exclude = context.excludeUserId?.trim();
    if (exclude) {
      recipientIds = recipientIds.filter((id) => id !== exclude);
    }
    if (recipientIds.length === 0) return this.emptyDeliveryReport();

    const title = renderNotificationTemplate(config.titleTemplate, vars);
    const body = renderNotificationTemplate(config.bodyTemplate, vars);
    const imageUrl = config.imageUrlTemplate
      ? renderNotificationTemplate(config.imageUrlTemplate, vars)
      : null;
    const linkUrl = config.defaultLinkUrl
      ? renderNotificationTemplate(config.defaultLinkUrl, vars)
      : null;

    const { excludeUserId: _omit, ...publicContext } = context;
    const data: Record<string, unknown> = {
      ...publicContext,
      ...(linkUrl ? { linkUrl } : {}),
    };

    return this.deliverToUsers({
      userIds: recipientIds,
      eventConfigId: config.id,
      eventKey: key,
      name: title,
      body,
      type: key,
      imageUrl: imageUrl || null,
      data,
      pushEnabled: config.pushEnabled,
      inAppEnabled: config.inAppEnabled,
    });
  }

  /**
   * Fire a configured event to an explicit user list (e.g. newly assigned accountants).
   * Audience rows on the config are ignored; recipients come from `userIds` only.
   */
  async dispatchToExplicitUsers(
    eventKey: string,
    userIds: string[],
    context: NotificationDispatchContext,
  ): Promise<NotificationDeliveryReport> {
    const key = eventKey.trim();
    if (!key) return this.emptyDeliveryReport();

    const config = await this.eventConfigs.findOne({
      where: { eventKey: key, isEnabled: true },
    });
    if (!config) return this.emptyDeliveryReport();

    const exclude = context.excludeUserId?.trim();
    const recipientIds = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))].filter(
      (id) => !exclude || id !== exclude,
    );
    if (recipientIds.length === 0) return this.emptyDeliveryReport();

    const vars = await this.buildTemplateVars(context);
    const title = renderNotificationTemplate(config.titleTemplate, vars);
    const body = renderNotificationTemplate(config.bodyTemplate, vars);
    const imageUrl = config.imageUrlTemplate
      ? renderNotificationTemplate(config.imageUrlTemplate, vars)
      : null;
    const linkUrl = config.defaultLinkUrl
      ? renderNotificationTemplate(config.defaultLinkUrl, vars)
      : null;

    const { excludeUserId: _omit, ...publicContext } = context;
    const data: Record<string, unknown> = {
      ...publicContext,
      ...(vars.customerName ? { customerName: vars.customerName } : {}),
      ...(linkUrl ? { linkUrl } : {}),
    };

    return this.deliverToUsers({
      userIds: recipientIds,
      eventConfigId: config.id,
      eventKey: key,
      name: title,
      body,
      type: key,
      imageUrl: imageUrl || null,
      data,
      pushEnabled: config.pushEnabled,
      inAppEnabled: config.inAppEnabled,
    });
  }

  /** Manual / admin broadcast using a config row (`trigger_type` may be `manual`). */
  async dispatchFromConfigId(configId: string, context: NotificationDispatchContext = {}): Promise<number> {
    const config = await this.eventConfigs.findOne({
      where: { id: configId, isEnabled: true },
      relations: { audiences: true },
    });
    if (!config) return 0;

    const vars = await this.buildTemplateVars(context);
    const recipientIds = await this.audienceResolver.resolveUserIds(config.audiences ?? [], vars);
    if (recipientIds.length === 0) return 0;

    const title = renderNotificationTemplate(config.titleTemplate, vars);
    const body = renderNotificationTemplate(config.bodyTemplate, vars);
    const imageUrl = config.imageUrlTemplate
      ? renderNotificationTemplate(config.imageUrlTemplate, vars)
      : null;

    await this.deliverToUsers({
      userIds: recipientIds,
      eventConfigId: config.id,
      eventKey: config.eventKey,
      name: title,
      body,
      type: config.eventKey,
      imageUrl: imageUrl || null,
      data: { ...context },
      pushEnabled: config.pushEnabled,
      inAppEnabled: config.inAppEnabled,
    });
    return recipientIds.length;
  }

  /** One-off admin broadcast (no saved event config required). */
  async broadcast(params: {
    title: string;
    body: string;
    imageUrl: string | null;
    linkUrl: string | null;
    inAppEnabled: boolean;
    pushEnabled: boolean;
    audiences: AudienceSpec[];
    userIds?: string[];
  }): Promise<NotificationDeliveryReport> {
    const recipientIds = await this.resolveBroadcastRecipientIds(params.audiences, params.userIds);
    if (recipientIds.length === 0) {
      return {
        recipientCount: 0,
        pushSummary: { sent: 0, noTokens: 0, fcmDisabled: 0, failed: 0, skipped: 0 },
        recipients: [],
      };
    }

    const data: Record<string, unknown> = {};
    if (params.linkUrl) data.linkUrl = params.linkUrl;

    return this.deliverToUsers({
      userIds: recipientIds,
      eventConfigId: null,
      eventKey: "broadcast",
      name: params.title,
      body: params.body,
      type: "broadcast",
      imageUrl: params.imageUrl,
      data,
      pushEnabled: params.pushEnabled,
      inAppEnabled: params.inAppEnabled,
    });
  }

  async countBroadcastRecipients(audiences: AudienceSpec[], userIds?: string[]): Promise<number> {
    const ids = await this.resolveBroadcastRecipientIds(audiences, userIds);
    return ids.length;
  }

  async previewBroadcastRecipients(
    audiences: AudienceSpec[],
    userIds?: string[],
    pushEnabled = true,
  ): Promise<BroadcastPreviewReport> {
    const ids = await this.resolveBroadcastRecipientIds(audiences, userIds);
    const tokenCounts = await this.deviceTokens.getActiveFirebaseTokenCountsForUsers(ids);
    const fcmConfigured = Boolean(getFirebaseMessaging());
    const recipients: BroadcastRecipientPreview[] = ids.map((userId) => {
      const deviceTokenCount = tokenCounts.get(userId) ?? 0;
      return {
        userId,
        deviceTokenCount,
        pushEligible: pushEnabled && fcmConfigured && deviceTokenCount > 0,
      };
    });
    const withTokens = recipients.filter((r) => r.deviceTokenCount > 0).length;
    return {
      recipientCount: ids.length,
      fcmConfigured,
      pushSummary: {
        withTokens,
        withoutTokens: ids.length - withTokens,
      },
      recipients,
    };
  }

  private async resolveBroadcastRecipientIds(
    audiences: AudienceSpec[],
    userIds?: string[],
  ): Promise<string[]> {
    const ids = new Set<string>();
    for (const id of userIds ?? []) {
      const t = id.trim();
      if (t) ids.add(t);
    }
    const fromAudiences = await this.audienceResolver.resolveUserIds(audiences, {});
    for (const id of fromAudiences) ids.add(id);
    return [...ids];
  }

  private emptyDeliveryReport(): NotificationDeliveryReport {
    return {
      recipientCount: 0,
      pushSummary: { sent: 0, noTokens: 0, fcmDisabled: 0, failed: 0, skipped: 0 },
      recipients: [],
    };
  }

  private async loadUserEmails(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.users.find({
      where: { id: In(userIds) },
      select: { id: true, email: true },
    });
    return new Map(rows.map((u) => [u.id, u.email]));
  }

  private formatRecipientEmails(userIds: string[], emails: Map<string, string>, max = 5): string {
    const labels = userIds.map((id) => emails.get(id) ?? id);
    if (labels.length <= max) return labels.join(", ");
    return `${labels.slice(0, max).join(", ")} +${labels.length - max} more`;
  }

  private async buildTemplateVars(
    context: NotificationDispatchContext,
  ): Promise<Record<string, string>> {
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(context)) {
      if (k === "excludeUserId") continue;
      if (v !== undefined && v !== null) vars[k] = String(v);
    }
    const cid = context.customerId?.trim();
    if (cid && !vars.customerName) {
      const customer = await this.customers.findOne({
        where: { id: cid },
        select: { id: true, name: true },
      });
      if (customer) vars.customerName = customer.name;
    }
    return vars;
  }

  /** Direct in-app notification to a single user (system events without event config). */
  async notifyUserInApp(params: {
    userId: string;
    eventKey: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    pushEnabled?: boolean;
  }): Promise<void> {
    await this.deliverToUsers({
      userIds: [params.userId],
      eventConfigId: null,
      eventKey: params.eventKey,
      name: params.title,
      body: params.body,
      type: params.eventKey,
      imageUrl: null,
      data: params.data ?? {},
      pushEnabled: params.pushEnabled ?? false,
      inAppEnabled: true,
    });
  }

  /** Deliver to explicit user ids (used by deadline campaigns and broadcasts). */
  async deliverToUsersPublic(params: {
    userIds: string[];
    eventConfigId: string | null;
    eventKey: string;
    name: string;
    body: string;
    type: string;
    imageUrl: string | null;
    data: Record<string, unknown>;
    pushEnabled: boolean;
    inAppEnabled: boolean;
  }): Promise<NotificationDeliveryReport> {
    return this.deliverToUsers(params);
  }

  private async deliverToUsers(params: {
    userIds: string[];
    eventConfigId: string | null;
    eventKey: string;
    name: string;
    body: string;
    type: string;
    imageUrl: string | null;
    data: Record<string, unknown>;
    pushEnabled: boolean;
    inAppEnabled: boolean;
  }): Promise<NotificationDeliveryReport> {
    const uniqueIds = [...new Set(params.userIds)];
    const emails = await this.loadUserEmails(uniqueIds);
    const pushSummary = {
      sent: 0,
      noTokens: 0,
      fcmDisabled: 0,
      failed: 0,
      skipped: 0,
    };
    const recipients: NotificationDeliveryRecipient[] = [];

    this.log.log(
      `Delivering notification eventKey=${params.eventKey} recipients=${uniqueIds.length} [${this.formatRecipientEmails(uniqueIds, emails)}] inApp=${params.inAppEnabled} push=${params.pushEnabled} title="${params.name}"`,
    );

    for (const userId of uniqueIds) {
      const email = emails.get(userId) ?? userId;
      let row: UserNotificationEntity | null = null;
      const inApp = params.inAppEnabled;
      if (inApp) {
        row = await this.userNotifications.save(
          this.userNotifications.create({
            userId,
            eventConfigId: params.eventConfigId,
            eventKey: params.eventKey,
            name: params.name,
            body: params.body,
            type: params.type,
            imageUrl: params.imageUrl,
            data: params.data,
            readAt: null,
          }),
        );
        this.gateway.emitToUser(userId, {
          id: row.id,
          name: row.name,
          body: row.body,
          type: row.type,
          image_url: row.imageUrl,
          data: row.data,
          event_key: row.eventKey,
          created_at: row.createdAt.toISOString(),
          read_at: null,
        });
      }

      let push: NotificationPushOutcome = "skipped";
      let deviceTokenCount = 0;
      if (params.pushEnabled) {
        const result = await this.sendPush(userId, email, {
          title: params.name,
          body: params.body,
          imageUrl: params.imageUrl,
          data: params.data,
          notificationId: row?.id,
        });
        push = result.outcome;
        deviceTokenCount = result.tokenCount;
        pushSummary[push] += 1;
      } else {
        pushSummary.skipped += 1;
      }

      recipients.push({ userId, email, inApp, push, deviceTokenCount });
    }

    if (params.pushEnabled) {
      this.log.log(
        `FCM delivery summary eventKey=${params.eventKey} sent=${pushSummary.sent} noTokens=${pushSummary.noTokens} fcmDisabled=${pushSummary.fcmDisabled} failed=${pushSummary.failed}`,
      );
      for (const row of recipients) {
        this.log.log(
          `FCM recipient email=${row.email} userId=${row.userId} push=${row.push} tokens=${row.deviceTokenCount} inApp=${row.inApp}`,
        );
      }
    }

    return {
      recipientCount: uniqueIds.length,
      pushSummary,
      recipients,
    };
  }

  private async sendPush(
    userId: string,
    email: string,
    payload: {
      title: string;
      body: string;
      imageUrl: string | null;
      data: Record<string, unknown>;
      notificationId?: string;
    },
  ): Promise<{ outcome: NotificationPushOutcome; tokenCount: number }> {
    try {
      const tokens = await this.deviceTokens.getActiveFirebaseTokensForUser(userId);
      if (tokens.length === 0) {
        this.log.warn(
          `FCM skipped email=${email} userId=${userId}: no active device token (POST /api/notifications/device-tokens)`,
        );
        return { outcome: "noTokens", tokenCount: 0 };
      }

      const data: Record<string, string> = {};
      for (const [k, v] of Object.entries(payload.data)) {
        if (v === undefined || v === null) continue;
        data[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
      if (payload.notificationId) data.notificationId = payload.notificationId;

      const messaging = getFirebaseMessaging();
      if (!messaging) {
        this.log.warn(`FCM skipped email=${email} userId=${userId}: firebase-admin not configured`);
        return { outcome: "fcmDisabled", tokenCount: tokens.length };
      }

      const result = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
          ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
        },
        data,
      });

      this.log.log(
        `FCM sent email=${email} userId=${userId} tokens=${tokens.length} success=${result.successCount} failure=${result.failureCount} title="${payload.title}"`,
      );
      if (result.failureCount > 0) {
        result.responses.forEach((response, index) => {
          if (response.success) return;
          this.log.warn(
            `FCM token failed email=${email} userId=${userId} index=${index} code=${response.error?.code ?? "unknown"} message=${response.error?.message ?? ""}`,
          );
        });
      }

      return {
        outcome: result.successCount > 0 ? "sent" : "failed",
        tokenCount: tokens.length,
      };
    } catch (err) {
      this.log.warn(
        `FCM push failed email=${email} userId=${userId}: ${err instanceof Error ? err.message : err}`,
      );
      return { outcome: "failed", tokenCount: 0 };
    }
  }
}
