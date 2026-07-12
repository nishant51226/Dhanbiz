import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ListInboxQueryDto } from "./dto/list-inbox-query.dto";
import { RegisterDeviceTokenDto } from "./dto/register-device-token.dto";
import { NotificationService } from "./notification.service";

type AuthedRequest = Request & { user?: AuthUser };

@ApiTags("notifications")
@Controller("notifications")
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post("device-tokens")
  @UseGuards(JwtAuthGuard)
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Register or refresh an FCM device token for a user" })
  async registerDeviceToken(@Req() req: AuthedRequest, @Body() dto: RegisterDeviceTokenDto) {
    return this.notificationService.registerDeviceToken(req.user, dto);
  }

  @Get("inbox")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "List in-app notifications for the current user" })
  listInbox(@Req() req: AuthedRequest, @Query() query: ListInboxQueryDto) {
    return this.notificationService.listInbox(req.user, query);
  }

  @Get("inbox/unread-count")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Unread notification count for the current user" })
  unreadCount(@Req() req: AuthedRequest) {
    return this.notificationService.unreadCount(req.user);
  }

  @Patch("inbox/read-all")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Mark all notifications as read" })
  markAllRead(@Req() req: AuthedRequest) {
    return this.notificationService.markAllRead(req.user);
  }

  @Patch("inbox/:id/read")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Mark one notification as read" })
  markRead(@Req() req: AuthedRequest, @Param("id") id: string) {
    return this.notificationService.markRead(req.user, id);
  }
}
