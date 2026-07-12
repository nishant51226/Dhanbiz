import { Body, Controller, Get, Post, Query, UseGuards, UsePipes, ValidationPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { AdminNotificationBroadcastService } from "./admin-notification-broadcast.service";
import { BroadcastNotificationDto } from "./dto/broadcast-notification.dto";

@ApiTags("admin")
@Controller("admin/notifications")
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth("bearer")
export class AdminNotificationsController {
  constructor(private readonly broadcast: AdminNotificationBroadcastService) {}

  @Get("broadcast/presets")
  @ApiOperation({ summary: "Audience presets for the broadcast composer (superadmin)" })
  listPresets() {
    return { presets: this.broadcast.listPresets() };
  }

  @Get("broadcast/recipient-user-filters")
  @ApiOperation({ summary: "Category filters for direct notification user picker (superadmin)" })
  listRecipientUserFilters() {
    return { filters: this.broadcast.listRecipientUserFilters() };
  }

  @Get("broadcast/recipient-customers")
  @ApiOperation({ summary: "List customers for direct notification user picker (superadmin)" })
  listRecipientCustomers(@Query("search") search?: string) {
    return this.broadcast.listRecipientCustomers(search);
  }

  @Get("broadcast/recipient-users")
  @ApiOperation({ summary: "List users for direct notification targeting (superadmin)" })
  listRecipientUsers(
    @Query("search") search?: string,
    @Query("category") category?: string,
    @Query("customer_id") customerId?: string,
  ) {
    return this.broadcast.listRecipientUsers(search, category, customerId);
  }

  @Post("broadcast/preview")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: "Count recipients for a broadcast without sending (superadmin)" })
  preview(@Body() dto: BroadcastNotificationDto) {
    return this.broadcast.preview(dto);
  }

  @Post("broadcast")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: "Send a broadcast notification now (superadmin)" })
  send(@Body() dto: BroadcastNotificationDto) {
    return this.broadcast.send(dto);
  }
}
