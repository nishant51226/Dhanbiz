import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { PermissionsService } from "../auth/permissions.service";

type AuthedRequest = Request & { user?: AuthUser };

/**
 * Superadmin, or a portal-scoped user with `portal:user:write` (customer admin managing portal logins).
 */
@Injectable()
export class AdminOrPortalUserWriteGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.auth.authEnabled()) {
      return true;
    }
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException("Forbidden");
    }
    if (user.isAdmin) {
      return true;
    }
    if (!user.customerId) {
      throw new ForbiddenException("Admin only");
    }
    const allowed = await this.permissions.hasPermission(user.userId, user.customerId, "portal:user:write", {
      portalScopedUser: true,
    });
    if (!allowed) {
      throw new ForbiddenException("Forbidden");
    }
    return true;
  }
}
