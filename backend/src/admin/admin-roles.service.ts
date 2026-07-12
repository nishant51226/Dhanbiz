import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RoleEntity } from "../entities/role.entity";
import { UserRoleEntity } from "../entities/user-role.entity";
import { PermissionsService } from "../auth/permissions.service";
import { isRoleType, parseRoleType, type RoleType } from "./role-types.js";

const NAME_RE = /^[a-z][a-z0-9_]{1,62}$/;
/** Allow `resource:action` and namespaced keys like `portal:job:read`. */
const PERM_RE = /^[a-z0-9_]+(:[a-z0-9_]+)+$/i;

export type AdminRoleDto = {
  id: string;
  name: string;
  roleType: RoleType;
  isSystem: boolean;
  description: string | null;
  permissions: string[];
  assignedUserCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeRoleName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

function sanitizePermissions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const p = x.trim().toLowerCase();
    if (p.length === 0 || p.length > 128) continue;
    if (!PERM_RE.test(p)) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function toDto(r: RoleEntity, assignedUserCount: number): AdminRoleDto {
  return {
    id: r.id,
    name: r.name,
    roleType: parseRoleType(r.roleType),
    isSystem: Boolean(r.isSystem),
    description: r.description ?? null,
    permissions: Array.isArray(r.permissions) ? [...r.permissions] : [],
    assignedUserCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class AdminRolesService {
  constructor(
    @InjectRepository(RoleEntity) private readonly roles: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity) private readonly userRoles: Repository<UserRoleEntity>,
    private readonly permissions: PermissionsService,
  ) {}

  async listRoles(roleType?: RoleType): Promise<AdminRoleDto[]> {
    const roles = await this.roles.find({
      where: roleType ? { roleType } : undefined,
      order: { name: "ASC" },
    });
    const raw = await this.userRoles
      .createQueryBuilder("ur")
      .select("ur.role_id", "roleId")
      .addSelect("COUNT(*)", "cnt")
      .groupBy("ur.role_id")
      .getRawMany<{ roleId: string; cnt: string }>();
    const countByRole = new Map<string, number>();
    for (const row of raw) {
      countByRole.set(row.roleId, Number.parseInt(row.cnt, 10) || 0);
    }
    return roles.map((r) => toDto(r, countByRole.get(r.id) ?? 0));
  }

  async getRole(id: string): Promise<AdminRoleDto> {
    const r = await this.roles.findOne({ where: { id } });
    if (!r) throw new NotFoundException("Role not found");
    const cnt = await this.userRoles.count({ where: { roleId: id } });
    return toDto(r, cnt);
  }

  async createRole(body: {
    name: string;
    roleType?: unknown;
    description?: unknown;
    permissions?: unknown;
  }) {
    const name = normalizeRoleName(body.name);
    if (!NAME_RE.test(name)) {
      throw new BadRequestException(
        "Role name must be 2-63 characters: start with a letter, then lowercase letters, digits, or underscore.",
      );
    }
    const roleType = parseRoleType(body.roleType, "staff");
    if (!isRoleType(roleType)) {
      throw new BadRequestException("roleType must be staff or portal");
    }
    const dup = await this.roles.exist({ where: { name } });
    if (dup) throw new ConflictException(`Role name "${name}" already exists`);
    const permissions = sanitizePermissions(body.permissions);
    const description =
      typeof body.description === "string" && body.description.trim().length > 0
        ? body.description.trim().slice(0, 512)
        : null;
    const row = this.roles.create({
      name,
      roleType,
      isSystem: false,
      description,
      permissions,
    });
    const saved = await this.roles.save(row);
    this.permissions.invalidateAllPermissionsCache();
    return this.getRole(saved.id);
  }

  async updateRole(
    id: string,
    body: { name?: string; description?: unknown; permissions?: unknown },
  ): Promise<AdminRoleDto> {
    const r = await this.roles.findOne({ where: { id } });
    if (!r) throw new NotFoundException("Role not found");
    if (body.name !== undefined) {
      if (r.isSystem) {
        throw new BadRequestException("System role names cannot be renamed");
      }
      const name = normalizeRoleName(body.name);
      if (!NAME_RE.test(name)) {
        throw new BadRequestException("Invalid role name");
      }
      const dup = await this.roles.findOne({ where: { name } });
      if (dup && dup.id !== id) throw new ConflictException(`Role name "${name}" already exists`);
      r.name = name;
    }
    if (body.description !== undefined) {
      r.description =
        typeof body.description === "string" && body.description.trim().length > 0
          ? body.description.trim().slice(0, 512)
          : null;
    }
    if (body.permissions !== undefined) {
      r.permissions = sanitizePermissions(body.permissions);
    }
    await this.roles.save(r);
    this.permissions.invalidateAllPermissionsCache();
    return this.getRole(id);
  }

  async deleteRole(id: string): Promise<void> {
    const r = await this.roles.findOne({ where: { id } });
    if (!r) throw new NotFoundException("Role not found");
    if (r.isSystem) {
      throw new BadRequestException("System roles cannot be deleted");
    }
    const cnt = await this.userRoles.count({ where: { roleId: id } });
    if (cnt > 0) {
      throw new ConflictException(`Cannot delete role: ${cnt} user(s) still have this role. Remove assignments first.`);
    }
    await this.roles.remove(r);
    this.permissions.invalidateAllPermissionsCache();
  }
}
