import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { AdminNotificationConfigService } from "./admin-notification-config.service";
import { UpsertNotificationConfigDto } from "./dto/upsert-notification-config.dto";

@ApiTags("admin")
@Controller("admin/notification-configs")
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth("bearer")
export class AdminNotificationConfigController {
  constructor(private readonly configs: AdminNotificationConfigService) {}

  @Get("audience-types")
  @ApiOperation({ summary: "List supported audience types for the admin editor" })
  audienceTypes() {
    return {
      types: [
        {
          id: "context_customer_portal_users",
          label: "Portal users on customer (from event context, excludes customer admins)",
        },
        {
          id: "context_customer_admins",
          label: "Customer admins on customer (from event context)",
        },
        {
          id: "context_practice_staff_on_customer",
          label: "Practice staff assigned to customer (from event context)",
        },
        {
          id: "all_portal_users",
          label: "All portal users (every customer, excludes customer admins)",
        },
        { id: "role", label: "Users with a specific role" },
        { id: "all_practice_staff_with_role", label: "All practice staff with role" },
      ],
    };
  }

  @Get()
  @ApiOperation({ summary: "List notification event configs (superadmin)" })
  list() {
    return this.configs.list();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one notification config (superadmin)" })
  get(@Param("id") id: string) {
    return this.configs.get(id);
  }

  @Post()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: "Create notification config (superadmin)" })
  create(@Body() dto: UpsertNotificationConfigDto) {
    return this.configs.create(dto);
  }

  @Patch(":id")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: "Update notification config (superadmin)" })
  update(@Param("id") id: string, @Body() dto: UpsertNotificationConfigDto) {
    return this.configs.update(id, dto);
  }

  @Post(":id/send-test")
  @ApiOperation({ summary: "Send a test notification using this config (superadmin)" })
  sendTest(@Param("id") id: string) {
    return this.configs.sendTest(id);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete notification config (superadmin)" })
  async remove(@Param("id") id: string) {
    await this.configs.remove(id);
    return { ok: true };
  }
}
