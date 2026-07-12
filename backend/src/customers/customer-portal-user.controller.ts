import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequireAnyPermission, RequirePermission } from "../auth/require-permission.decorator";
import { CustomerPortalUserService } from "./customer-portal-user.service";

@ApiTags("customers")
@Controller("customers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("customer:read")
export class CustomerPortalUserController {
  constructor(private readonly portalUsers: CustomerPortalUserService) {}

  /** Static path before `:customerId/*` so it is not captured as a CRUD id. */
  @Get("portal-user/roles")
  @ApiOperation({ summary: "Roles assignable when creating a customer-scoped login (excludes staff)" })
  listPortalUserRoles() {
    return this.portalUsers.listAssignablePortalRoles();
  }

  @Post(":customerId/portal-user")
  @ApiOperation({
    summary:
      "Create portal login for a customer (body.roleId required; optional email, password; else onboarding email + generated password)",
  })
  async createPortalUser(
    @Param("customerId") customerId: string,
    @Body() body: { email?: string; roleId?: string; password?: string },
  ) {
    return this.portalUsers.createPortalUserForCustomer(customerId, {
      email: typeof body?.email === "string" ? body.email : undefined,
      roleId: typeof body?.roleId === "string" ? body.roleId : "",
      password: typeof body?.password === "string" ? body.password : undefined,
    });
  }

  @Post(":customerId/portal-user/:userId/password")
  @ApiOperation({
    summary:
      "Set a new password for an existing portal login (optional body.password; omit or empty to generate — returned once)",
  })
  async resetPortalUserPassword(
    @Param("customerId", ParseUUIDPipe) customerId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() body: { password?: string },
  ) {
    return this.portalUsers.resetPortalUserPasswordForCustomer(customerId, userId, {
      password: typeof body?.password === "string" ? body.password : undefined,
    });
  }

  @Patch(":customerId/portal-user/:userId")
  @RequireAnyPermission("customer:write", "portal:user:write")
  @ApiOperation({ summary: "Change portal role for an existing customer login" })
  async updatePortalUserRole(
    @Param("customerId", ParseUUIDPipe) customerId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() body: { roleId?: string },
  ) {
    return this.portalUsers.updatePortalUserRoleForCustomer(
      customerId,
      userId,
      typeof body?.roleId === "string" ? body.roleId : "",
    );
  }
}
