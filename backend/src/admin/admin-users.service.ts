import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { In, IsNull, Repository } from "typeorm";
import type { AuthUser } from "../auth/auth.types";
import { PermissionsService } from "../auth/permissions.service";
import { StaffCustomerAssignmentSyncService } from "../customers/staff-customer-assignment-sync.service.js";
import { DUPLICATE_USER_EMAIL_MESSAGE } from "../auth/user-email.constants";
import { Customer } from "../entities/customer.entity";
import { CustomerUserEntity } from "../entities/customer-user.entity";
import { RoleEntity } from "../entities/role.entity";
import { StaffCustomerAssignmentEntity } from "../entities/staff-customer-assignment.entity";
import { UserEntity } from "../entities/user.entity";
import { UserRoleEntity } from "../entities/user-role.entity";
import type { RoleType } from "./role-types.js";

export type AdminPracticeUserRow = {
  id: string;
  email: string;
  isAdmin: boolean;
  phoneNumber: string | null;
  createdAt: string;
  roles: { id: string; name: string }[];
};

export type AdminPracticeUserCustomerAssignmentRow = {
  customerId: string;
  customerName: string;
  assignedAt: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

function parseRoleIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function randomPassword(): string {
  return crypto.randomBytes(18).toString("base64url").slice(0, 24);
}

/** Roles allowed for practice (staff) users on this app — not customer portal roles. */
const STAFF_ROLE_TYPE: RoleType = "staff";

/** Portal logins a customer admin may remove — not other portal admins. */
const PORTAL_USER_MANAGE_PERMISSION = "portal:user:write";

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity) private readonly userRoles: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity) private readonly roles: Repository<RoleEntity>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(StaffCustomerAssignmentEntity)
    private readonly assignments: Repository<StaffCustomerAssignmentEntity>,
    @InjectRepository(CustomerUserEntity)
    private readonly customerUsers: Repository<CustomerUserEntity>,
    private readonly permissions: PermissionsService,
    private readonly staffAssignmentSync: StaffCustomerAssignmentSyncService,
  ) {}

  private async getUserOrThrow(id: string): Promise<UserEntity> {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException("User not found");
    return u;
  }

  private async getPracticeUserOrThrow(id: string): Promise<UserEntity> {
    const u = await this.users.findOne({ where: { id, customerId: IsNull() } });
    if (!u) throw new NotFoundException("Practice user not found");
    return u;
  }

  private async currentRoleIds(userId: string): Promise<string[]> {
    const rows = await this.userRoles.find({ where: { userId }, select: { roleId: true } });
    return rows.map((r) => r.roleId);
  }

  private async assertPracticeStaffRoleIds(roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) return;
    const rows = await this.roles.find({
      where: { id: In(roleIds) },
      select: { id: true, name: true, roleType: true },
    });
    if (rows.length !== roleIds.length) {
      throw new BadRequestException("One or more role ids are invalid");
    }
    for (const r of rows) {
      if (r.roleType !== STAFF_ROLE_TYPE) {
        throw new BadRequestException("Practice staff may only be assigned staff roles");
      }
    }
  }

  private async toRow(userId: string): Promise<AdminPracticeUserRow> {
    const u = await this.users.findOne({
      where: { id: userId },
      select: { id: true, email: true, isAdmin: true, phoneNumber: true, createdAt: true, customerId: true },
    });
    if (!u || u.customerId != null) throw new NotFoundException("Practice user not found");
    const assignments = await this.userRoles.find({
      where: { userId },
      relations: { role: true },
    });
    const roleList = assignments
      .map((a) => (a.role ? { id: a.role.id, name: a.role.name } : null))
      .filter((x): x is { id: string; name: string } => x !== null);

    return {
      id: u.id,
      email: u.email,
      isAdmin: u.isAdmin,
      phoneNumber: u.phoneNumber,
      createdAt: u.createdAt.toISOString(),
      roles: roleList,
    };
  }

  /**
   * Practice (staff) directory: users not scoped to a customer organisation.
   * Portal end-users are excluded because they carry `customer_id`.
   */
  async listPracticeUsers(): Promise<AdminPracticeUserRow[]> {
    const list = await this.users.find({
      where: { customerId: IsNull() },
      select: { id: true, email: true, isAdmin: true, phoneNumber: true, createdAt: true },
      order: { email: "ASC" },
    });
    if (list.length === 0) return [];

    const ids = list.map((x) => x.id);
    const assignments = await this.userRoles.find({
      where: { userId: In(ids) },
      relations: { role: true },
    });

    const byUser = new Map<string, { id: string; name: string }[]>();
    for (const a of assignments) {
      const role = a.role;
      if (!role) continue;
      const arr = byUser.get(a.userId) ?? [];
      arr.push({ id: role.id, name: role.name });
      byUser.set(a.userId, arr);
    }

    return list.map((u) => ({
      id: u.id,
      email: u.email,
      isAdmin: u.isAdmin,
      phoneNumber: u.phoneNumber,
      createdAt: u.createdAt.toISOString(),
      roles: byUser.get(u.id) ?? [],
    }));
  }

  /**
   * Create a practice (staff) login. Password optional — generated when omitted.
   * Non-superadmin users must receive at least one role.
   */
  async createPracticeUser(body: {
    email?: unknown;
    password?: unknown;
    isAdmin?: unknown;
    roleIds?: unknown;
  }): Promise<AdminPracticeUserRow & { initialPassword?: string }> {
    const email = normalizeEmail(body.email);
    if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
      throw new BadRequestException("Valid email is required");
    }
    const exists = await this.users.exist({ where: { email } });
    if (exists) throw new ConflictException(DUPLICATE_USER_EMAIL_MESSAGE);

    const isAdmin = Boolean(body.isAdmin);
    const roleIds = parseRoleIds(body.roleIds);
    if (!isAdmin && roleIds.length === 0) {
      throw new BadRequestException("Assign at least one role, or enable superadmin");
    }
    await this.assertPracticeStaffRoleIds(roleIds);

    let generatedPlain: string | undefined;
    let passwordToHash = typeof body.password === "string" ? body.password : "";
    if (passwordToHash.trim().length === 0) {
      generatedPlain = randomPassword();
      passwordToHash = generatedPlain;
    } else if (passwordToHash.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters when provided");
    }

    const passwordHash = await bcrypt.hash(passwordToHash, 12);

    let newId!: string;
    await this.users.manager.transaction(async (em) => {
      const userRepo = em.getRepository(UserEntity);
      const urRepo = em.getRepository(UserRoleEntity);
      const u = userRepo.create({
        email,
        passwordHash,
        customerId: null,
        phoneNumber: null,
        isAdmin,
      });
      const saved = await userRepo.save(u);
      newId = saved.id;
      for (const roleId of roleIds) {
        await urRepo.save(urRepo.create({ userId: saved.id, roleId }));
      }
    });

    this.permissions.invalidateForUser(newId);
    if (!isAdmin) {
      await this.staffAssignmentSync.syncAllCustomersForPracticeStaffIfPermitted({
        userId: newId,
        isAdmin: false,
        customerId: null,
      });
    }
    const row = await this.toRow(newId);
    return generatedPlain ? { ...row, initialPassword: generatedPlain } : row;
  }

  /**
   * Update superadmin flag and/or replace role assignments for a practice user.
   */
  async updatePracticeUser(
    id: string,
    body: { isAdmin?: unknown; roleIds?: unknown },
    actorUserId?: string,
  ): Promise<AdminPracticeUserRow> {
    const u = await this.getPracticeUserOrThrow(id);

    const nextIsAdmin = body.isAdmin !== undefined ? Boolean(body.isAdmin) : undefined;
    if (nextIsAdmin === false && actorUserId && actorUserId === id && u.isAdmin) {
      throw new ForbiddenException("Cannot remove superadmin from your own account");
    }

    const roleIdsProvided = body.roleIds !== undefined;
    const roleIds = roleIdsProvided ? parseRoleIds(body.roleIds) : null;

    const willBeAdmin = nextIsAdmin !== undefined ? nextIsAdmin : u.isAdmin;
    const mergedRoleIds = roleIds !== null ? roleIds : await this.currentRoleIds(id);
    if (!willBeAdmin && mergedRoleIds.length === 0) {
      throw new BadRequestException("Assign at least one role, or enable superadmin");
    }

    if (roleIds !== null) {
      await this.assertPracticeStaffRoleIds(roleIds);
    }

    if (nextIsAdmin !== undefined) {
      u.isAdmin = nextIsAdmin;
      await this.users.save(u);
    }

    if (roleIds !== null) {
      await this.userRoles.delete({ userId: id });
      for (const roleId of roleIds) {
        await this.userRoles.save(this.userRoles.create({ userId: id, roleId }));
      }
    }

    this.permissions.invalidateForUser(id);
    if (!willBeAdmin) {
      await this.staffAssignmentSync.syncAllCustomersForPracticeStaffIfPermitted({
        userId: id,
        isAdmin: false,
        customerId: null,
      });
    }
    return this.toRow(id);
  }

  /**
   * Replace login password for a practice user. Omit or blank `password` to auto-generate (returned once).
   */
  async setPracticeUserPassword(
    id: string,
    body: { password?: unknown },
  ): Promise<{ ok: true; initialPassword?: string }> {
    await this.getPracticeUserOrThrow(id);
    let generatedPlain: string | undefined;
    let passwordToHash = typeof body.password === "string" ? body.password.trim() : "";
    if (passwordToHash.length === 0) {
      generatedPlain = randomPassword();
      passwordToHash = generatedPlain;
    } else if (passwordToHash.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters when provided");
    }
    const passwordHash = await bcrypt.hash(passwordToHash, 12);
    await this.users.update({ id }, { passwordHash });
    return generatedPlain ? { ok: true, initialPassword: generatedPlain } : { ok: true };
  }

  /**
   * Delete a practice (staff) or customer portal user by id.
   * Practice: removes staff assignments + roles + user (blocks last superadmin).
   * Portal: removes customer_users + roles + user (must have `customer_id`).
   */
  async deletePracticeUser(
    id: string,
    actor?: AuthUser,
    options?: { archive?: boolean },
  ): Promise<{ ok: true; kind: "practice" | "portal"; archived?: boolean }> {
    const user = await this.getUserOrThrow(id);
    if (actor?.userId && actor.userId === user.id) {
      throw new ForbiddenException("Cannot delete your own account");
    }
    await this.assertActorMayDeleteUser(actor, user);

    if (user.customerId != null) {
      if (options?.archive) {
        return this.archivePortalUser(user);
      }
      return this.deletePortalUser(user);
    }

    if (options?.archive) {
      throw new BadRequestException("Archive is only supported for customer portal users");
    }

    return this.deletePracticeStaffUser(user);
  }

  /** Non-superadmin actors may only delete/archive portal users for their own customer tenant. */
  private async assertActorMayDeleteUser(actor: AuthUser | undefined, target: UserEntity): Promise<void> {
    if (!actor || actor.isAdmin) {
      return;
    }
    if (!actor.customerId) {
      throw new ForbiddenException("Forbidden");
    }
    if (target.customerId == null) {
      throw new ForbiddenException("Cannot delete practice users");
    }
    if (target.customerId !== actor.customerId) {
      throw new ForbiddenException("Forbidden");
    }
    const targetPerms = await this.permissions.listEffectivePermissions(target.id);
    if (targetPerms.includes(PORTAL_USER_MANAGE_PERMISSION)) {
      throw new ForbiddenException("Customer admins cannot remove other portal admins");
    }
  }

  async activatePortalUser(
    id: string,
    actor?: AuthUser,
  ): Promise<{ ok: true; kind: "portal"; activated: true }> {
    const user = await this.getUserOrThrow(id);
    await this.assertActorMayDeleteUser(actor, user);

    if (user.isAdmin) {
      throw new BadRequestException("Cannot activate admin accounts");
    }
    if (!user.customerId) {
      throw new BadRequestException("User is not a portal user");
    }

    await this.customerUsers.update(
      { userId: user.id, customerId: user.customerId },
      { isActive: true },
    );
    this.permissions.invalidateForUser(user.id);
    return { ok: true, kind: "portal", activated: true };
  }

  private async archivePortalUser(user: UserEntity): Promise<{ ok: true; kind: "portal"; archived: true }> {
    if (user.isAdmin) {
      throw new BadRequestException("Cannot archive admin accounts");
    }
    if (!user.customerId) {
      throw new BadRequestException("User is not a portal user");
    }

    await this.customerUsers.update({ userId: user.id }, { isActive: false });
    this.permissions.invalidateForUser(user.id);
    return { ok: true, kind: "portal", archived: true };
  }

  private async deletePortalUser(user: UserEntity): Promise<{ ok: true; kind: "portal" }> {
    if (user.isAdmin) {
      throw new BadRequestException("Cannot delete admin accounts");
    }
    if (!user.customerId) {
      throw new BadRequestException("User is not a portal user");
    }

    const id = user.id;
    await this.users.manager.transaction(async (em) => {
      const assignmentRepo = em.getRepository(StaffCustomerAssignmentEntity);
      const customerUserRepo = em.getRepository(CustomerUserEntity);
      const userRoleRepo = em.getRepository(UserRoleEntity);
      const userRepo = em.getRepository(UserEntity);
      await assignmentRepo.delete({ staffUserId: id });
      await customerUserRepo.delete({ userId: id });
      await userRoleRepo.delete({ userId: id });
      await userRepo.delete({ id });
    });

    this.permissions.invalidateForUser(id);
    return { ok: true, kind: "portal" };
  }

  private async deletePracticeStaffUser(user: UserEntity): Promise<{ ok: true; kind: "practice" }> {
    if (user.customerId != null) {
      throw new BadRequestException("User is not a practice staff account");
    }

    const id = user.id;
    if (user.isAdmin) {
      const adminCount = await this.users.count({
        where: { customerId: IsNull(), isAdmin: true },
      });
      if (adminCount <= 1) {
        throw new BadRequestException("Cannot delete the last superadmin account");
      }
    }

    await this.users.manager.transaction(async (em) => {
      const assignmentRepo = em.getRepository(StaffCustomerAssignmentEntity);
      const userRoleRepo = em.getRepository(UserRoleEntity);
      const userRepo = em.getRepository(UserEntity);
      await assignmentRepo.delete({ staffUserId: id });
      await userRoleRepo.delete({ userId: id });
      await userRepo.delete({ id });
    });

    this.permissions.invalidateForUser(id);
    return { ok: true, kind: "practice" };
  }

  /**
   * Resolves assignable customer ids (any non-archived account_status). Stale/archived
   * ids from old assignments are dropped; ids that never existed still raise 400.
   */
  private async resolveAssignableCustomerIdsForAssignment(customerIds: string[]): Promise<string[]> {
    if (customerIds.length === 0) return [];
    const assignable = await this.customers.find({
      where: { id: In(customerIds) },
      select: { id: true },
    });
    const assignableSet = new Set(assignable.map((c) => c.id));
    if (assignableSet.size === customerIds.length) {
      return customerIds.filter((id) => assignableSet.has(id));
    }
    const stale = customerIds.filter((id) => !assignableSet.has(id));
    const archivedOrMissing = await this.customers.find({
      where: { id: In(stale) },
      select: { id: true },
      withDeleted: true,
    });
    const knownIds = new Set(archivedOrMissing.map((c) => c.id));
    const unknown = stale.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException("One or more customer ids are invalid");
    }
    return customerIds.filter((id) => assignableSet.has(id));
  }

  async listCustomerAssignmentsForPracticeUser(id: string): Promise<AdminPracticeUserCustomerAssignmentRow[]> {
    await this.getPracticeUserOrThrow(id);
    const rows = await this.assignments.find({
      where: { staffUserId: id },
      relations: { customer: true },
      order: { createdAt: "ASC" },
    });
    const staleAssignmentIds = rows.filter((r) => !r.customer).map((r) => r.id);
    if (staleAssignmentIds.length > 0) {
      await this.assignments.delete({ id: In(staleAssignmentIds) });
    }
    return rows
      .filter((r): r is typeof r & { customer: Customer } => r.customer != null)
      .map((r) => ({
        customerId: r.customerId,
        customerName: r.customer.name ?? "",
        assignedAt: r.createdAt.toISOString(),
      }));
  }

  async replaceCustomerAssignmentsForPracticeUser(
    id: string,
    customerIdsRaw: unknown,
  ): Promise<AdminPracticeUserCustomerAssignmentRow[]> {
    const user = await this.getPracticeUserOrThrow(id);
    if (user.isAdmin) {
      throw new BadRequestException("Superadmin users do not require customer assignments");
    }
    const requestedIds = parseRoleIds(customerIdsRaw);
    const customerIds = await this.resolveAssignableCustomerIdsForAssignment(requestedIds);
    await this.assignments.manager.transaction(async (em) => {
      const repo = em.getRepository(StaffCustomerAssignmentEntity);
      await repo.delete({ staffUserId: id });
      for (const customerId of customerIds) {
        await repo.save(repo.create({ staffUserId: id, customerId }));
      }
    });
    return this.listCustomerAssignmentsForPracticeUser(id);
  }
}
