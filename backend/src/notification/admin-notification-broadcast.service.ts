import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Customer } from "../entities/customer.entity";
import { RoleEntity } from "../entities/role.entity";
import { UserEntity } from "../entities/user.entity";
import { findRoleIdsByPermission } from "../admin/role-permission.util.js";
import type { BroadcastNotificationDto, BroadcastPreset } from "./dto/broadcast-notification.dto";
import { NotificationDispatchService } from "./notification-dispatch.service";
import type { AudienceSpec } from "./notification-audience.types";
import type { NotificationPushOutcome } from "./notification-dispatch.service";
import {
  BroadcastRecipientUserResolver,
  type BroadcastRecipientUserFilter,
  type BroadcastRecipientUserOption,
  RECIPIENT_USER_FILTERS,
} from "./broadcast-recipient-user.resolver";
import { NotificationGroupService } from "./notification-group.service";

export type { BroadcastRecipientUserFilter, BroadcastRecipientUserOption };

export type BroadcastDeliveryRecipientRow = {
  user_id: string;
  email: string;
  in_app: boolean;
  push: NotificationPushOutcome;
  device_token_count: number;
};

export type BroadcastDeliveryResponse = {
  recipient_count: number;
  push_summary: {
    sent: number;
    noTokens: number;
    fcmDisabled: number;
    failed: number;
    skipped: number;
  };
  recipients: BroadcastDeliveryRecipientRow[];
};

export type BroadcastPreviewRecipientRow = {
  user_id: string;
  email: string;
  device_token_count: number;
  push_eligible: boolean;
};

export type BroadcastPreviewResponse = {
  recipient_count: number;
  fcm_configured: boolean;
  push_summary: {
    with_tokens: number;
    without_tokens: number;
  };
  recipients: BroadcastPreviewRecipientRow[];
};

@Injectable()
export class AdminNotificationBroadcastService {
  private readonly log = new Logger(AdminNotificationBroadcastService.name);

  constructor(
    private readonly dispatch: NotificationDispatchService,
    private readonly recipientResolver: BroadcastRecipientUserResolver,
    private readonly notificationGroups: NotificationGroupService,
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  async send(dto: BroadcastNotificationDto): Promise<BroadcastDeliveryResponse> {
    const specs = await this.resolveAudienceSpecs(dto);
    const userIds = await this.resolveBroadcastUserIds(dto);
    this.assertHasTargets(specs, userIds);

    const audienceSummary = specs.map((s) => s.audienceType).join(", ") || "none";
    this.log.log(
      `Broadcast send title="${dto.title.trim()}" audiences=[${audienceSummary}] presets=${(dto.presets ?? []).join(",") || "none"} userIds=${userIds.length} groups=${(dto.group_ids ?? []).length} inApp=${dto.in_app_enabled !== false} push=${dto.push_enabled !== false}`,
    );

    const report = await this.dispatch.broadcast({
      title: dto.title.trim(),
      body: dto.body.trim(),
      imageUrl: dto.image_url?.trim() || null,
      linkUrl: dto.link_url?.trim() || null,
      inAppEnabled: dto.in_app_enabled !== false,
      pushEnabled: dto.push_enabled !== false,
      audiences: specs,
      userIds,
    });

    const response = await this.enrichDeliveryResponse(report);
    this.log.log(
      `Broadcast complete recipient_count=${response.recipient_count} mobile_sent=${response.push_summary.sent} no_tokens=${response.push_summary.noTokens}`,
    );
    return response;
  }

  listPresets(): { id: BroadcastPreset; label: string; description: string }[] {
    return [
      {
        id: "portal_users",
        label: "All portal users",
        description: "Standard customer portal logins (excludes customer admins)",
      },
      {
        id: "customer_admins",
        label: "All customer admins",
        description: "Portal admins across every customer organisation",
      },
      {
        id: "managers",
        label: "All managers",
        description: "Practice staff with the manager role",
      },
      {
        id: "accountants",
        label: "All accountants",
        description: "Practice staff with the accountant role",
      },
      {
        id: "practice_staff",
        label: "All practice staff",
        description: "Managers and accountants",
      },
    ];
  }

  listRecipientUserFilters(): {
    id: BroadcastRecipientUserFilter;
    label: string;
    hint?: string;
    group: "practice" | "portal";
  }[] {
    return [
      {
        id: "practice_admin",
        label: "Practice admin",
        hint: "Superadmin logins on the practice side",
        group: "practice",
      },
      {
        id: "practice_managers",
        label: "Managers",
        hint: "Practice staff with the manager role",
        group: "practice",
      },
      {
        id: "practice_accountants",
        label: "Accountants",
        hint: "Practice staff with the accountant role",
        group: "practice",
      },
      {
        id: "portal_admins",
        label: "Customer admins",
        hint: "Portal admins for a customer organisation",
        group: "portal",
      },
      {
        id: "portal_users",
        label: "Portal users",
        hint: "Standard customer portal logins",
        group: "portal",
      },
      {
        id: "portal_all",
        label: "All portal users",
        hint: "Every active customer portal login",
        group: "portal",
      },
    ];
  }

  async listRecipientCustomers(search?: string): Promise<{ id: string; name: string }[]> {
    const term = search?.trim() ?? "";
    const qb = this.customers
      .createQueryBuilder("c")
      .select(["c.id", "c.name"])
      .orderBy("c.name", "ASC")
      .take(100);
    if (term.length >= 1) {
      qb.andWhere("c.name ILIKE :s", { s: `%${term}%` });
    }
    const rows = await qb.getMany();
    return rows.map((c) => ({ id: c.id, name: c.name.trim() }));
  }

  async listRecipientUsers(
    search?: string,
    category?: string,
    customerId?: string,
  ): Promise<BroadcastRecipientUserOption[]> {
    return this.recipientResolver.listRecipientUsers(search, category, customerId);
  }

  private async resolveAudienceSpecs(dto: BroadcastNotificationDto): Promise<AudienceSpec[]> {
    const specs: AudienceSpec[] = [];

    for (const preset of dto.presets ?? []) {
      specs.push(...(await this.specsForPreset(preset)));
    }

    for (const a of dto.audiences ?? []) {
      specs.push({
        audienceType: a.audience_type,
        roleId: a.role_id?.trim() || null,
      });
    }

    const key = (s: AudienceSpec) => `${s.audienceType}:${s.roleId ?? ""}`;
    const seen = new Set<string>();
    return specs.filter((s) => {
      const k = key(s);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  private async specsForPreset(preset: BroadcastPreset): Promise<AudienceSpec[]> {
    switch (preset) {
      case "portal_users":
        return [{ audienceType: "all_portal_users", roleId: null }];
      case "customer_admins": {
        const roleIds = await findRoleIdsByPermission(this.roles, "portal:user:write", {
          roleType: "portal",
        });
        return roleIds.map((roleId) => ({ audienceType: "role" as const, roleId }));
      }
      case "practice_staff":
        return [
          ...(await this.specsForPreset("managers")),
          ...(await this.specsForPreset("accountants")),
        ];
      case "managers": {
        const roleIds = await findRoleIdsByPermission(this.roles, "customer:write", {
          roleType: "staff",
        });
        return roleIds.map((roleId) => ({ audienceType: "all_practice_staff_with_role" as const, roleId }));
      }
      case "accountants": {
        const roleIds = await findRoleIdsByPermission(this.roles, "job:read", {
          roleType: "staff",
          excludePermissions: ["customer:write"],
        });
        return roleIds.map((roleId) => ({ audienceType: "all_practice_staff_with_role" as const, roleId }));
      }
      default:
        return [];
    }
  }

  async preview(dto: BroadcastNotificationDto): Promise<BroadcastPreviewResponse> {
    const specs = await this.resolveAudienceSpecs(dto);
    const userIds = await this.resolveBroadcastUserIds(dto);
    this.assertHasTargets(specs, userIds);
    const report = await this.dispatch.previewBroadcastRecipients(
      specs,
      userIds,
      dto.push_enabled !== false,
    );
    return this.enrichPreviewResponse(report);
  }

  private async enrichDeliveryResponse(
    report: import("./notification-dispatch.service").NotificationDeliveryReport,
  ): Promise<BroadcastDeliveryResponse> {
    const missingIds = report.recipients.filter((r) => !r.email).map((r) => r.userId);
    const fallbackEmails =
      missingIds.length > 0 ? await this.loadEmailsByUserIds(missingIds) : new Map<string, string>();
    return {
      recipient_count: report.recipientCount,
      push_summary: report.pushSummary,
      recipients: report.recipients.map((r) => ({
        user_id: r.userId,
        email: r.email || fallbackEmails.get(r.userId) || r.userId,
        in_app: r.inApp,
        push: r.push,
        device_token_count: r.deviceTokenCount,
      })),
    };
  }

  private async enrichPreviewResponse(
    report: import("./notification-dispatch.service").BroadcastPreviewReport,
  ): Promise<BroadcastPreviewResponse> {
    const emails = await this.loadEmailsByUserIds(report.recipients.map((r) => r.userId));
    return {
      recipient_count: report.recipientCount,
      fcm_configured: report.fcmConfigured,
      push_summary: {
        with_tokens: report.pushSummary.withTokens,
        without_tokens: report.pushSummary.withoutTokens,
      },
      recipients: report.recipients.map((r) => ({
        user_id: r.userId,
        email: emails.get(r.userId) ?? r.userId,
        device_token_count: r.deviceTokenCount,
        push_eligible: r.pushEligible,
      })),
    };
  }

  private async loadEmailsByUserIds(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.users.find({
      where: { id: In(userIds) },
      select: { id: true, email: true },
    });
    return new Map(rows.map((u) => [u.id, u.email]));
  }

  private assertHasTargets(specs: AudienceSpec[], userIds: string[]): void {
    if (specs.length === 0 && userIds.length === 0) {
      throw new BadRequestException(
        "Select at least one user, custom group, or built-in audience (managers, portal users, etc.).",
      );
    }
  }

  private async resolveBroadcastUserIds(dto: BroadcastNotificationDto): Promise<string[]> {
    const direct = await this.normalizeUserIds(dto.user_ids);
    const fromGroups = await this.notificationGroups.resolveGroupsUserIds(dto.group_ids ?? []);
    return [...new Set([...direct, ...fromGroups])];
  }

  private async normalizeUserIds(raw: string[] | undefined): Promise<string[]> {
    const unique = [...new Set((raw ?? []).map((id) => id.trim()).filter(Boolean))];
    if (unique.length === 0) return [];

    const found = await this.users.find({
      where: { id: In(unique) },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException("One or more selected users were not found.");
    }
    return unique;
  }
}

// Keep filter list available for tests / imports that referenced the constant.
export { RECIPIENT_USER_FILTERS };
