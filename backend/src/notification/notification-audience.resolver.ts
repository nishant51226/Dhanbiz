import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { findRoleIdsByPermission, roleHasPermission } from "../admin/role-permission.util.js";
import { CustomerUserEntity } from "../entities/customer-user.entity";
import { RoleEntity } from "../entities/role.entity";
import type { NotificationAudienceType } from "../entities/notification-event-audience.entity";
import type { AudienceSpec } from "./notification-audience.types";
import { StaffCustomerAssignmentEntity } from "../entities/staff-customer-assignment.entity";
import { UserRoleEntity } from "../entities/user-role.entity";

export type NotificationDispatchContext = {
  customerId?: string;
  customerName?: string;
  fileId?: string;
  fileName?: string;
  fileCount?: string;
  /** Single file name or e.g. "10 files" for batched uploads. */
  uploadSummary?: string;
  /** Omit this user from resolved recipients (e.g. the uploader). */
  excludeUserId?: string;
  /** Library document id (for deep links). */
  documentId?: string;
  [key: string]: string | undefined;
};

@Injectable()
export class NotificationAudienceResolver {
  constructor(
    @InjectRepository(CustomerUserEntity)
    private readonly customerUsers: Repository<CustomerUserEntity>,
    @InjectRepository(StaffCustomerAssignmentEntity)
    private readonly staffAssignments: Repository<StaffCustomerAssignmentEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoles: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
  ) {}

  async resolveUserIds(
    audiences: AudienceSpec[],
    context: NotificationDispatchContext,
  ): Promise<string[]> {
    const ids = new Set<string>();
    for (const audience of audiences) {
      const resolved = await this.resolveOne(audience.audienceType, audience.roleId, context);
      for (const id of resolved) ids.add(id);
    }
    return [...ids];
  }

  private async resolveOne(
    type: NotificationAudienceType,
    roleId: string | null,
    context: NotificationDispatchContext,
  ): Promise<string[]> {
    const customerId = context.customerId?.trim();
    switch (type) {
      case "context_customer_portal_users": {
        if (!customerId) return [];
        return this.findActiveStandardPortalUserIds(customerId);
      }
      case "context_customer_admins": {
        if (!customerId) return [];
        const adminRoleIds = await this.portalAdminRoleIds();
        if (adminRoleIds.length === 0) return [];
        const rows = await this.customerUsers.find({
          where: { customerId, roleId: In(adminRoleIds), isActive: true },
          select: { userId: true },
        });
        return rows.map((r) => r.userId);
      }
      case "context_practice_staff_on_customer": {
        if (!customerId) return [];
        const rows = await this.staffAssignments.find({
          where: { customerId },
          select: { staffUserId: true },
        });
        return rows.map((r) => r.staffUserId);
      }
      case "all_portal_users": {
        return this.findActiveStandardPortalUserIds();
      }
      case "role": {
        if (!roleId) return [];
        const practice = await this.userRoles.find({
          where: { roleId },
          select: { userId: true },
        });
        const portal = await this.customerUsers.find({
          where: { roleId, isActive: true },
          select: { userId: true },
        });
        return [...practice.map((r) => r.userId), ...portal.map((r) => r.userId)];
      }
      case "all_practice_staff_with_role": {
        if (!roleId) return [];
        const rows = await this.userRoles.find({
          where: { roleId },
          select: { userId: true },
        });
        return rows.map((r) => r.userId);
      }
      default:
        return [];
    }
  }

  private async portalAdminRoleIds(): Promise<string[]> {
    return findRoleIdsByPermission(this.roles, "portal:user:write", { roleType: "portal" });
  }

  /** Active portal logins without portal user-management permission (excludes portal admins). */
  private async findActiveStandardPortalUserIds(customerId?: string): Promise<string[]> {
    const portalRoles = await this.roles.find({
      where: { roleType: "portal" },
      select: { id: true, permissions: true },
    });
    const standardRoleIds = portalRoles
      .filter((r) => !roleHasPermission(r.permissions, "portal:user:write"))
      .map((r) => r.id);
    if (standardRoleIds.length === 0) return [];

    const rows = await this.customerUsers.find({
      where: {
        ...(customerId ? { customerId } : {}),
        roleId: In(standardRoleIds),
        isActive: true,
      },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
}
