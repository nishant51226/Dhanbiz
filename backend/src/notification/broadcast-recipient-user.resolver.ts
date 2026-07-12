import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { roleHasPermission } from "../admin/role-permission.util.js";
import { CustomerUserEntity } from "../entities/customer-user.entity";
import { UserEntity } from "../entities/user.entity";
import { UserRoleEntity } from "../entities/user-role.entity";
import type { NotificationGroupRuleFilter } from "../entities/notification-group-rule.entity";

export type BroadcastRecipientUserFilter = NotificationGroupRuleFilter;

export type BroadcastRecipientUserOption = {
  id: string;
  email: string;
  label: string;
  kind: "practice" | "portal";
  roleLabel?: string;
  customerName?: string | null;
};

export const RECIPIENT_USER_FILTERS: BroadcastRecipientUserFilter[] = [
  "practice_admin",
  "practice_managers",
  "practice_accountants",
  "portal_admins",
  "portal_users",
  "portal_all",
];

@Injectable()
export class BroadcastRecipientUserResolver {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoles: Repository<UserRoleEntity>,
    @InjectRepository(CustomerUserEntity)
    private readonly customerUsers: Repository<CustomerUserEntity>,
  ) {}

  parseFilter(raw?: string): BroadcastRecipientUserFilter | null {
    const value = raw?.trim() as BroadcastRecipientUserFilter | undefined;
    if (!value) return null;
    return RECIPIENT_USER_FILTERS.includes(value) ? value : null;
  }

  /** Resolve user IDs matching a broadcast recipient filter (optionally scoped to one customer). */
  async resolveUserIdsForFilter(
    filter: BroadcastRecipientUserFilter,
    customerId?: string | null,
  ): Promise<string[]> {
    const cid = customerId?.trim() ?? "";
    const qb = this.users.createQueryBuilder("u").select("u.id").distinct(true);

    if (cid) {
      this.applyCustomerRecipientFilter(qb, cid, filter);
    } else {
      this.applyRecipientUserFilter(qb, filter);
    }

    const rows = await qb.getMany();
    return rows.map((u) => u.id);
  }

  async listRecipientUsers(
    search?: string,
    category?: string,
    customerId?: string,
  ): Promise<BroadcastRecipientUserOption[]> {
    const term = search?.trim() ?? "";
    const filter = this.parseFilter(category);
    const cid = customerId?.trim() ?? "";
    if (!filter && term.length < 1 && !cid) {
      return [];
    }

    const qb = this.users
      .createQueryBuilder("u")
      .leftJoinAndSelect("u.customer", "c")
      .orderBy("u.email", "ASC")
      .take(300);

    if (term.length >= 1) {
      qb.andWhere("(u.email ILIKE :s OR c.name ILIKE :s)", { s: `%${term}%` });
    }

    if (cid) {
      this.applyCustomerRecipientFilter(qb, cid, filter);
    } else if (filter) {
      this.applyRecipientUserFilter(qb, filter);
    }

    qb.distinct(true);
    const rows = await qb.getMany();
    return this.enrichRecipientUserOptions(rows, cid || null);
  }

  async enrichRecipientUserOptions(
    users: UserEntity[],
    scopedCustomerId: string | null = null,
  ): Promise<BroadcastRecipientUserOption[]> {
    if (users.length === 0) return [];

    const ids = users.map((u) => u.id);
    const practiceRoles = await this.userRoles.find({
      where: { userId: In(ids) },
      relations: { role: true },
    });
    const portalLinks = await this.customerUsers.find({
      where: scopedCustomerId
        ? { userId: In(ids), isActive: true, customerId: scopedCustomerId }
        : { userId: In(ids), isActive: true },
      relations: { role: true, customer: true },
    });

    const practiceRoleByUser = new Map<string, string[]>();
    for (const row of practiceRoles) {
      const name = row.role?.name?.trim();
      if (!name) continue;
      const list = practiceRoleByUser.get(row.userId) ?? [];
      list.push(name);
      practiceRoleByUser.set(row.userId, list);
    }

    const portalByUser = new Map<string, { roleName: string; customerName: string | null; isPortalAdmin: boolean }>();
    for (const row of portalLinks) {
      const roleName = row.role?.name?.trim() ?? "portal";
      const customerName = row.customer?.name?.trim() ?? null;
      const isPortalAdmin = roleHasPermission(row.role?.permissions, "portal:user:write");
      const existing = portalByUser.get(row.userId);
      if (!existing || isPortalAdmin) {
        portalByUser.set(row.userId, { roleName, customerName, isPortalAdmin });
      }
    }

    return users.map((u) => {
      const portal = portalByUser.get(u.id);
      const isPortal = Boolean(portal ?? u.customerId);
      const customerName = portal?.customerName ?? u.customer?.name?.trim() ?? null;

      if (isPortal) {
        const roleLabel = portal?.isPortalAdmin ? "Portal admin" : "Portal user";
        const customerSuffix = customerName ? ` · ${customerName}` : "";
        return {
          id: u.id,
          email: u.email,
          kind: "portal" as const,
          roleLabel,
          customerName,
          label: `${u.email} — ${roleLabel}${customerSuffix}`,
        };
      }

      const roles = practiceRoleByUser.get(u.id) ?? [];
      const roleLabel = u.isAdmin
        ? "Practice admin"
        : roles.length > 0
          ? roles.join(", ")
          : "Practice staff";
      return {
        id: u.id,
        email: u.email,
        kind: "practice" as const,
        roleLabel,
        customerName: null,
        label: `${u.email} — ${roleLabel}`,
      };
    });
  }

  private applyCustomerRecipientFilter(
    qb: ReturnType<Repository<UserEntity>["createQueryBuilder"]>,
    customerId: string,
    filter: BroadcastRecipientUserFilter | null,
  ): void {
    if (
      filter === "practice_admin" ||
      filter === "practice_managers" ||
      filter === "practice_accountants"
    ) {
      qb.andWhere("1 = 0");
      return;
    }

    qb.innerJoin(
      "customer_users",
      "cu",
      "cu.user_id = u.id AND cu.is_active = true AND cu.customer_id = :customerId",
      { customerId },
    );

    switch (filter) {
      case "portal_admins":
        qb.innerJoin(
          "roles",
          "cr",
          "cr.id = cu.role_id AND cr.role_type = 'portal' AND cr.permissions @> '[\"portal:user:write\"]'::jsonb",
        );
        return;
      case "portal_users":
        qb.innerJoin(
          "roles",
          "cr",
          "cr.id = cu.role_id AND cr.role_type = 'portal' AND NOT (cr.permissions @> '[\"portal:user:write\"]'::jsonb)",
        );
        return;
      case "portal_all":
      default:
        return;
    }
  }

  private applyRecipientUserFilter(
    qb: ReturnType<Repository<UserEntity>["createQueryBuilder"]>,
    filter: BroadcastRecipientUserFilter,
  ): void {
    switch (filter) {
      case "practice_admin":
        qb.andWhere("u.customer_id IS NULL").andWhere("u.is_admin = true");
        return;
      case "practice_managers":
        qb.andWhere("u.customer_id IS NULL")
          .innerJoin("user_roles", "ur", "ur.user_id = u.id")
          .innerJoin(
            "roles",
            "pr",
            "pr.id = ur.role_id AND pr.role_type = 'staff' AND pr.permissions @> '[\"customer:write\"]'::jsonb",
          );
        return;
      case "practice_accountants":
        qb.andWhere("u.customer_id IS NULL")
          .innerJoin("user_roles", "ur", "ur.user_id = u.id")
          .innerJoin(
            "roles",
            "pr",
            `pr.id = ur.role_id AND pr.role_type = 'staff' AND pr.permissions @> '["document:assignee"]'::jsonb`,
          );
        return;
      case "portal_admins":
        qb.innerJoin("customer_users", "cu", "cu.user_id = u.id AND cu.is_active = true")
          .innerJoin(
            "roles",
            "cr",
            "cr.id = cu.role_id AND cr.role_type = 'portal' AND cr.permissions @> '[\"portal:user:write\"]'::jsonb",
          );
        return;
      case "portal_users":
        qb.innerJoin("customer_users", "cu", "cu.user_id = u.id AND cu.is_active = true")
          .innerJoin(
            "roles",
            "cr",
            "cr.id = cu.role_id AND cr.role_type = 'portal' AND NOT (cr.permissions @> '[\"portal:user:write\"]'::jsonb)",
          );
        return;
      case "portal_all":
        qb.innerJoin("customer_users", "cu", "cu.user_id = u.id AND cu.is_active = true");
        return;
      default:
        return;
    }
  }
}
