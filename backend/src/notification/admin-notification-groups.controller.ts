import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AdminGuard } from "../admin/admin.guard";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UpsertNotificationGroupDto } from "./dto/upsert-notification-group.dto";
import { NotificationGroupService } from "./notification-group.service";

type AuthedRequest = Request & { user?: AuthUser };

@ApiTags("admin")
@Controller("admin/notifications/groups")
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth("bearer")
export class AdminNotificationGroupsController {
  constructor(private readonly groups: NotificationGroupService) {}

  @Get()
  @ApiOperation({ summary: "List custom notification groups (superadmin)" })
  list() {
    return this.groups.list();
  }

  @Post("preview-draft")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: "Preview resolved recipient count for unsaved group membership (superadmin)" })
  previewDraft(@Body() dto: UpsertNotificationGroupDto) {
    return this.groups.previewDraftMembership(dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one notification group (superadmin)" })
  getOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.groups.getOne(id);
  }

  @Post()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: "Create notification group (superadmin)" })
  create(@Body() dto: UpsertNotificationGroupDto, @Req() req: AuthedRequest) {
    return this.groups.create(dto, req.user?.userId);
  }

  @Patch(":id")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: "Update notification group (superadmin)" })
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpsertNotificationGroupDto) {
    return this.groups.update(id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete notification group (superadmin)" })
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.groups.remove(id);
    return { ok: true };
  }

  @Post(":id/preview")
  @ApiOperation({ summary: "Preview resolved recipient count for a group (superadmin)" })
  preview(@Param("id", ParseUUIDPipe) id: string) {
    return this.groups.previewResolvedCount(id);
  }
}
