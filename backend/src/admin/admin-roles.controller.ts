import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "./admin.guard";
import { AdminRolesService } from "./admin-roles.service";
import { PERMISSION_CATALOG } from "./permission-catalog";
import { isRoleType, type RoleType } from "./role-types.js";

@ApiTags("admin")
@Controller("admin/roles")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminRolesController {
  constructor(private readonly adminRoles: AdminRolesService) {}

  /** Static segment must be registered before `:id` so it is not captured as an id. */
  @Get("permission-catalog")
  @ApiOperation({ summary: "List known permission keys for role editor (superadmin)" })
  permissionCatalog() {
    return { entries: PERMISSION_CATALOG };
  }

  @Get()
  @ApiOperation({ summary: "List roles with assignment counts (superadmin)" })
  @ApiQuery({ name: "role_type", required: false, enum: ["staff", "portal"] })
  listRoles(@Query("role_type") roleTypeRaw?: string) {
    const roleType =
      typeof roleTypeRaw === "string" && isRoleType(roleTypeRaw.trim().toLowerCase())
        ? (roleTypeRaw.trim().toLowerCase() as RoleType)
        : undefined;
    return this.adminRoles.listRoles(roleType);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one role (superadmin)" })
  getRole(@Param("id") id: string) {
    return this.adminRoles.getRole(id);
  }

  @Post()
  @ApiOperation({ summary: "Create role (superadmin)" })
  createRole(
    @Body()
    body: {
      name: string;
      roleType?: string;
      description?: string;
      permissions?: string[];
    },
  ) {
    return this.adminRoles.createRole(body);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update role name and/or permissions (superadmin)" })
  updateRole(
    @Param("id") id: string,
    @Body() body: { name?: string; description?: string; permissions?: string[] },
  ) {
    return this.adminRoles.updateRole(id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete role if unassigned (superadmin)" })
  async deleteRole(@Param("id") id: string) {
    await this.adminRoles.deleteRole(id);
    return { ok: true };
  }
}
