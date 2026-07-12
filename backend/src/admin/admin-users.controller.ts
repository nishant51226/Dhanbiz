import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "./admin.guard";
import { AdminOrPortalUserWriteGuard } from "./admin-or-portal-user-write.guard";
import { AdminUsersService } from "./admin-users.service";

type AuthedRequest = Request & { user?: AuthUser };

@ApiTags("admin")
@Controller("admin/users")
@UseGuards(JwtAuthGuard)
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "List practice (non-portal) users for staff directory (superadmin)" })
  listPracticeUsers() {
    return this.adminUsers.listPracticeUsers();
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Create practice user with optional roles (superadmin)" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["email"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", description: "Optional; min 8 chars, or omitted to auto-generate" },
        isAdmin: { type: "boolean" },
        roleIds: { type: "array", items: { type: "string", format: "uuid" } },
      },
    },
  })
  createPracticeUser(@Body() body: Record<string, unknown>) {
    return this.adminUsers.createPracticeUser(body);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Update practice user superadmin flag and/or role assignments (superadmin)" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        isAdmin: { type: "boolean" },
        roleIds: { type: "array", items: { type: "string", format: "uuid" } },
      },
    },
  })
  updatePracticeUser(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthedRequest,
  ) {
    return this.adminUsers.updatePracticeUser(id, body, req.user?.userId);
  }

  @Delete(":id")
  @UseGuards(AdminOrPortalUserWriteGuard)
  @ApiOperation({
    summary:
      "Delete practice or customer portal user (superadmin or customer admin with portal:user:write). Portal users: pass ?archive=true to deactivate instead of hard delete.",
  })
  deletePracticeUser(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("archive") archive: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const archiveMode = archive === "true" || archive === "1";
    return this.adminUsers.deletePracticeUser(id, req.user, { archive: archiveMode });
  }

  @Post(":id/activate")
  @UseGuards(AdminOrPortalUserWriteGuard)
  @ApiOperation({
    summary:
      "Reactivate a deactivated customer portal user (superadmin or customer admin with portal:user:write).",
  })
  activatePortalUser(@Param("id", ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.adminUsers.activatePortalUser(id, req.user);
  }

  @Post(":id/password")
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: "Set or regenerate password for a practice user (superadmin). Omit password to auto-generate.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        password: {
          type: "string",
          description: "Optional; min 8 chars. Omit or empty to generate a one-time password (returned in response).",
        },
      },
    },
  })
  setPracticeUserPassword(@Param("id", ParseUUIDPipe) id: string, @Body() body: { password?: unknown }) {
    return this.adminUsers.setPracticeUserPassword(id, body);
  }

  @Get(":id/customer-assignments")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "List assigned customers for a practice user (superadmin)" })
  listCustomerAssignments(@Param("id", ParseUUIDPipe) id: string) {
    return this.adminUsers.listCustomerAssignmentsForPracticeUser(id);
  }

  @Post(":id/customer-assignments")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Replace assigned customers for a practice user (superadmin)" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        customerIds: { type: "array", items: { type: "string", format: "uuid" } },
      },
    },
  })
  replaceCustomerAssignments(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { customerIds?: unknown },
  ) {
    return this.adminUsers.replaceCustomerAssignmentsForPracticeUser(id, body?.customerIds);
  }
}
