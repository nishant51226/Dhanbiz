import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";

type AuthedRequest = Request & { user?: AuthUser };

/**
 * Requires an authenticated admin (`users.is_admin` / JWT `adm`).
 * When auth is disabled (dev), allows the request through.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.auth.authEnabled()) {
      return true;
    }
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user?.isAdmin) {
      throw new ForbiddenException("Admin only");
    }
    return true;
  }
}
