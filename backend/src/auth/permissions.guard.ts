import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { DataSource } from "typeorm";
import type { AuthUser } from "./auth.types";
import { REQUIRED_ANY_PERMISSIONS_KEY, REQUIRED_PERMISSION_KEY } from "./permissions.constants";
import { PermissionsService } from "./permissions.service";
import { PERMISSION_RESOURCE_KEY } from "./permission-resource.decorator";

type AuthenticatedRequest = Request & { user?: AuthUser };

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const targetClass = context.getClass();

    const requiredAny = this.reflector.getAllAndOverride<string[]>(REQUIRED_ANY_PERMISSIONS_KEY, [
      handler,
      targetClass,
    ]);

    // 1) Explicit required permission on route/class
    let requiredPermission = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION_KEY, [
      handler,
      targetClass,
    ]);

    // 2) If absent, try building from resource + HTTP method
    if (!requiredAny?.length && !requiredPermission) {
      const resource = this.reflector.getAllAndOverride<string>(PERMISSION_RESOURCE_KEY, [
        handler,
        targetClass,
      ]);
      if (resource) {
        const reqAuto = context.switchToHttp().getRequest<Request>();
        const action = methodToAction(reqAuto.method);
        if (action) {
          requiredPermission = `${resource}:${action}`;
        }
      }
    }

    // 3) If nothing is required, allow
    if (!requiredAny?.length && !requiredPermission) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException("Unauthorized");
    }
    // Superadmin bypass
    if (user.isAdmin) {
      return true;
    }

    const routeCustomerId = this.readCustomerIdParam(req);
    if (user.customerId && routeCustomerId && user.customerId !== routeCustomerId) {
      throw new ForbiddenException("Forbidden");
    }
    if (!user.customerId && routeCustomerId) {
      const assignment = await this.hasStaffCustomerAssignment(user.userId, routeCustomerId);
      if (!assignment) {
        throw new ForbiddenException("Forbidden");
      }
    }

    const scopeCustomerId = routeCustomerId ?? user.customerId;
    const portalScopedUser = Boolean(user.customerId);

    if (requiredAny?.length) {
      for (const p of requiredAny) {
        if (
          await this.permissions.hasPermission(user.userId, scopeCustomerId, p, {
            portalScopedUser,
          })
        ) {
          return true;
        }
      }
      throw new ForbiddenException("Forbidden");
    }

    const allowed = await this.permissions.hasPermission(user.userId, scopeCustomerId, requiredPermission!, {
      portalScopedUser,
    });
    if (!allowed) {
      throw new ForbiddenException("Forbidden");
    }
    return true;
  }

  private readCustomerIdParam(req: Request): string | null {
    const params = req.params as Record<string, unknown> | undefined;
    if (!params) return null;
    const path = typeof req.path === "string" ? req.path : "";
    const underCustomers =
      path === "/customers" ||
      path.startsWith("/customers/") ||
      path === "/api/customers" ||
      path.startsWith("/api/customers/");
    if (!underCustomers) {
      return null;
    }
    const customerId = params.customerId;
    if (typeof customerId === "string" && customerId.length > 0 && isUuidParam(customerId)) {
      return customerId;
    }
    const id = params.id;
    if (
      typeof id === "string" &&
      id.length > 0 &&
      isUuidParam(id) &&
      path !== "/customers" &&
      path !== "/api/customers"
    ) {
      return id;
    }
    return null;
  }

  private async hasStaffCustomerAssignment(userId: string, customerId: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `
      SELECT 1
      FROM staff_customer_assignments sca
      WHERE sca.staff_user_id = $1
        AND sca.customer_id = $2
      LIMIT 1
      `,
      [userId, customerId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }
}

function isUuidParam(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function methodToAction(method: string): "read" | "create" | "update" | "delete" | null {
  switch (method.toUpperCase()) {
    case "GET":
    case "HEAD":
      return "read";
    case "POST":
      return "create";
    case "PUT":
    case "PATCH":
      return "update";
    case "DELETE":
      return "delete";
    default:
      return null;
  }
}

