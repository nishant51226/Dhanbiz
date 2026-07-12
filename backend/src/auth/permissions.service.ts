import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserRoleEntity } from "../entities/user-role.entity";

type CacheEntry = {
  permissions: Set<string>;
  expiresAt: number;
};

const PORTAL_PERMISSION_ALIASES: Record<string, readonly string[]> = {
  "customer:read": ["portal:customer:read", "portal:settings:read", "portal:settings:write"],
  "customer:write": ["portal:customer:write", "portal:settings:write"],
  "file:read": ["portal:file:read", "portal:file:write"],
  "file:write": ["portal:file:write"],
  "subscription_plan:read": ["portal:subscription_plan:read"],
  "subscription_plan:write": ["portal:subscription_plan:write"],
  /** `customer_admin` had settings write before `portal:user:*` was added; keep equivalent access. */
  "portal:user:read": ["portal:settings:read", "portal:settings:write"],
  "portal:user:write": ["portal:settings:write"],
};

@Injectable()
export class PermissionsService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(UserRoleEntity)
    private readonly userRoles: Repository<UserRoleEntity>
  ) {
    const ttlSec = Number(this.config.get("AUTH_PERMISSIONS_CACHE_TTL_SEC"));
    this.ttlMs = Number.isFinite(ttlSec) && ttlSec > 0 ? Math.floor(ttlSec * 1000) : 60_000;
  }

  invalidateForUser(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}|`)) {
        this.cache.delete(key);
      }
    }
  }

  /** After role definitions change, clear all cached permission sets. */
  invalidateAllPermissionsCache(): void {
    this.cache.clear();
  }

  async hasPermission(
    userId: string,
    _customerId: string | null,
    permission: string,
    opts?: { portalScopedUser?: boolean }
  ): Promise<boolean> {
    // Customer scope is enforced by Jwt/Permissions guards via route vs user.customerId.
    const perms = await this.getPermissions(userId);
    if (perms.has(permission)) return true;
    if (opts?.portalScopedUser) {
      const aliases = PORTAL_PERMISSION_ALIASES[permission];
      if (aliases?.some((p) => perms.has(p))) return true;
    }
    return false;
  }

  /** All permission keys from assigned roles (sorted). Admins should not call this for authz — use `isAdmin` bypass. */
  async listEffectivePermissions(userId: string): Promise<string[]> {
    const perms = await this.getPermissions(userId);
    return [...perms].sort((a, b) => a.localeCompare(b));
  }

  /** Assigned role names for user-facing labels (deduplicated, sorted). */
  async listEffectiveRoleNames(userId: string): Promise<string[]> {
    const rows = await this.userRoles
      .createQueryBuilder("ur")
      .innerJoin("ur.role", "r")
      .select("r.name", "name")
      .where("ur.user_id = :userId", { userId })
      .getRawMany<{ name: string }>();
    const names = [...new Set(rows.map((r) => String(r.name ?? "").trim()).filter(Boolean))];
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }

  private async getPermissions(userId: string): Promise<Set<string>> {
    const key = `${userId}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.permissions;
    }

    const rows = await this.userRoles
      .createQueryBuilder("ur")
      .innerJoinAndSelect("ur.role", "r")
      .where("ur.user_id = :userId", { userId })
      .getMany();

    const permissions = new Set<string>();
    for (const row of rows) {
      const list = row.role?.permissions;
      if (!Array.isArray(list)) continue;
      for (const p of list) {
        if (typeof p === "string" && p.length > 0) {
          permissions.add(p);
        }
      }
    }

    this.cache.set(key, { permissions, expiresAt: now + this.ttlMs });
    return permissions;
  }
}

