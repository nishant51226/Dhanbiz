import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import type { AuthUser } from "./auth.types";

type AuthenticatedRequest = Request & { user?: AuthUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.auth.authEnabled()) {
      return true;
    }
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Unauthorized");
    }
    const token = h.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException("Invalid or expired token");
    }
    const user = this.auth.readAuthUser(token);
    if (!user) {
      throw new UnauthorizedException("Invalid or expired token");
    }
    if (!(await this.auth.assertUserMayUseAccessToken(user))) {
      throw new UnauthorizedException("This account has been deactivated");
    }
    req.user = user;
    return true;
  }
}
