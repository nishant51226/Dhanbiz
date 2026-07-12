import crypto from "node:crypto";
import bcrypt from "bcrypt";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { Customer } from "../entities/customer.entity";
import { CustomerUserEntity } from "../entities/customer-user.entity";
import { RoleEntity } from "../entities/role.entity";
import { UserEntity } from "../entities/user.entity";
import { UserRoleEntity } from "../entities/user-role.entity";
import { PermissionsService } from "../auth/permissions.service";
import { DUPLICATE_USER_EMAIL_MESSAGE } from "../auth/user-email.constants";

const STAFF_ROLE_NAME = "staff";

function randomPassword(): string {
  return crypto.randomBytes(18).toString("base64url").slice(0, 24);
}

function isValidPortalEmail(t: string): boolean {
  if (t.length < 5 || t.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function contactEmailFromOnboarding(onboardingData: Record<string, unknown> | null): string | null {
  if (!onboardingData || typeof onboardingData !== "object") return null;
  const contact = onboardingData.contact;
  if (!contact || typeof contact !== "object" || Array.isArray(contact)) return null;
  const email = (contact as Record<string, unknown>).email;
  if (typeof email !== "string") return null;
  const t = email.trim().toLowerCase();
  if (!isValidPortalEmail(t)) return null;
  return t;
}

/** Optional email from `POST ?/portal-user` body (takes precedence over onboarding JSON). */
function normalizePortalEmailInput(raw: string | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim().toLowerCase();
  if (!isValidPortalEmail(t)) return null;
  return t;
}

function splitEmailForAlias(email: string): { local: string; domain: string } {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return { local: "user", domain: "example.invalid" };
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

/** When no portal email is supplied, build a RFC-shaped unique login address (still unique-checked below). */
function syntheticPortalEmailBase(customerId: string): string {
  const tag = crypto.randomBytes(10).toString("hex");
  const idPart = customerId.replace(/-/g, "").slice(0, 16);
  return `portal.${idPart}.${tag}@customer.portal.local`;
}

function isPortalRole(role: RoleEntity): boolean {
  return String(role.roleType ?? "").trim().toLowerCase() === "portal";
}

@Injectable()
export class CustomerPortalUserService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(RoleEntity) private readonly roles: Repository<RoleEntity>,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * Roles that can be assigned to a customer-scoped login.
   * Only customer-side (portal-scoped) roles are allowed here.
   */
  async listAssignablePortalRoles(): Promise<
    { id: string; name: string; description: string | null; permissions: string[] }[]
  > {
    const rows = await this.roles.find({ order: { name: "ASC" } });
    return rows
      .filter((r) => isPortalRole(r))
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description?.trim() || null,
        permissions: Array.isArray(r.permissions) ? [...r.permissions] : [],
      }));
  }

  /**
   * Creates a non-admin user linked to the customer, `customer_users` row, and `user_roles`.
   * Email: body `email` if valid, else `customer.onboardingData.contact.email`, else a generated
   * `portal.*@customer.portal.local` address (copy from the API response — not a real inbox).
   * Password: body `password` when at least 8 chars, otherwise generated (returned once).
   */
  async createPortalUserForCustomer(
    customerId: string,
    body: { email?: string; roleId: string; password?: string },
  ): Promise<{ email: string; password: string }> {
    const customer = await this.customers.findOne({
      where: { id: customerId },
      select: { id: true, onboardingData: true },
    });
    if (!customer) throw new NotFoundException("Customer not found");

    const roleId = String(body?.roleId ?? "").trim();
    if (!roleId) {
      throw new BadRequestException("roleId is required");
    }
    const role = await this.roles.findOne({ where: { id: roleId } });
    if (!role) {
      throw new BadRequestException("Invalid roleId");
    }
    if (!isPortalRole(role)) {
      throw new BadRequestException("Only portal roles can be assigned to a customer portal user");
    }

    const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
    const fromBody = normalizePortalEmailInput(body.email);
    if (rawEmail.length > 0 && !fromBody) {
      throw new BadRequestException("Invalid email address.");
    }
    const fromOnboarding = contactEmailFromOnboarding(
      customer.onboardingData && typeof customer.onboardingData === "object" && !Array.isArray(customer.onboardingData)
        ? (customer.onboardingData as Record<string, unknown>)
        : null,
    );
    const preferred = fromBody ?? fromOnboarding ?? syntheticPortalEmailBase(customerId);

    let plainPassword = typeof body.password === "string" ? body.password.trim() : "";
    if (plainPassword.length > 0 && plainPassword.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters when provided");
    }
    if (plainPassword.length === 0) {
      plainPassword = randomPassword();
    }

    const passwordHash = await bcrypt.hash(plainPassword, 12);

    const { local, domain } = splitEmailForAlias(preferred);
    const usersRepo = this.dataSource.getRepository(UserEntity);
    const loginEmailIsSynthetic = fromBody === null && fromOnboarding === null;
    let loginEmail: string;
    if (loginEmailIsSynthetic) {
      loginEmail = preferred;
      let suffix = 0;
      while (await usersRepo.exists({ where: { email: loginEmail } })) {
        suffix += 1;
        const tag = crypto.randomBytes(3).toString("hex");
        loginEmail = `${local}+portal.${suffix}.${tag}@${domain}`.slice(0, 320);
      }
    } else {
      const taken = await usersRepo.exists({ where: { email: preferred } });
      if (taken) {
        throw new ConflictException(DUPLICATE_USER_EMAIL_MESSAGE);
      }
      loginEmail = preferred;
    }

    const userId = await this.dataSource.transaction(async (em) => {
      const u = em.create(UserEntity, {
        email: loginEmail,
        passwordHash,
        customerId,
        phoneNumber: null,
        isAdmin: false,
      });
      const saved = await em.save(UserEntity, u);
      await em.save(
        UserRoleEntity,
        em.create(UserRoleEntity, {
          userId: saved.id,
          roleId: role.id,
        }),
      );
      await em.save(
        CustomerUserEntity,
        em.create(CustomerUserEntity, {
          customerId,
          userId: saved.id,
          roleId: role.id,
          isActive: true,
        }),
      );
      return saved.id;
    });

    this.permissions.invalidateForUser(userId);

    return { email: loginEmail, password: plainPassword };
  }

  /**
   * Sets a new password for an existing portal login linked to the customer.
   * Omit or blank `password` to generate one (returned once).
   */
  async resetPortalUserPasswordForCustomer(
    customerId: string,
    userId: string,
    body: { password?: string },
  ): Promise<{ email: string; password: string }> {
    const cuRepo = this.dataSource.getRepository(CustomerUserEntity);
    const link = await cuRepo.findOne({ where: { customerId, userId } });
    if (!link) {
      throw new NotFoundException("Portal user not found for this customer");
    }

    const usersRepo = this.dataSource.getRepository(UserEntity);
    const user = await usersRepo.findOne({
      where: { id: userId },
      select: { id: true, email: true, customerId: true, isAdmin: true },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    if (user.isAdmin) {
      throw new BadRequestException("Cannot reset password for admin accounts here");
    }
    if (user.customerId !== customerId) {
      throw new ForbiddenException("User is not scoped to this customer");
    }

    let plainPassword = typeof body.password === "string" ? body.password.trim() : "";
    if (plainPassword.length > 0 && plainPassword.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters when provided");
    }
    if (plainPassword.length === 0) {
      plainPassword = randomPassword();
    }

    const passwordHash = await bcrypt.hash(plainPassword, 12);
    await usersRepo.update({ id: userId }, { passwordHash });
    this.permissions.invalidateForUser(userId);

    return { email: user.email, password: plainPassword };
  }

  /**
   * Changes the portal role for an existing customer login.
   * Keeps `user_roles` and `customer_users.role_id` in sync (single portal role per user).
   */
  async updatePortalUserRoleForCustomer(
    customerId: string,
    userId: string,
    roleId: string,
  ): Promise<{ ok: true; roleId: string; roleName: string }> {
    const nextRoleId = String(roleId ?? "").trim();
    if (!nextRoleId) {
      throw new BadRequestException("roleId is required");
    }

    const cuRepo = this.dataSource.getRepository(CustomerUserEntity);
    const link = await cuRepo.findOne({ where: { customerId, userId } });
    if (!link) {
      throw new NotFoundException("Portal user not found for this customer");
    }

    const role = await this.roles.findOne({ where: { id: nextRoleId } });
    if (!role) {
      throw new BadRequestException("Invalid roleId");
    }
    if (!isPortalRole(role)) {
      throw new BadRequestException("Only portal roles can be assigned to a customer portal user");
    }

    const usersRepo = this.dataSource.getRepository(UserEntity);
    const user = await usersRepo.findOne({
      where: { id: userId },
      select: { id: true, customerId: true, isAdmin: true },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    if (user.isAdmin) {
      throw new BadRequestException("Cannot change role for admin accounts here");
    }
    if (user.customerId !== customerId) {
      throw new ForbiddenException("User is not scoped to this customer");
    }

    await this.dataSource.transaction(async (em) => {
      await em.getRepository(UserRoleEntity).delete({ userId });
      await em.save(
        UserRoleEntity,
        em.create(UserRoleEntity, { userId, roleId: role.id }),
      );
      await em.update(CustomerUserEntity, { customerId, userId }, { roleId: role.id });
    });

    this.permissions.invalidateForUser(userId);
    return { ok: true, roleId: role.id, roleName: role.name };
  }
}
