import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionResource } from "../auth/permission-resource.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import type { QueueDashboardResponse } from "./queue-dashboard.types";
import { QueueService } from "./queue.service";

@ApiTags("jobs")
@ApiBearerAuth("bearer")
@Controller("jobs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@PermissionResource("job")
export class QueueDashboardController {
  constructor(private readonly queue: QueueService) {}

  @Get("pg-boss-dashboard")
  @ApiOperation({ summary: "pg-boss queue monitor — live and recent jobs per queue" })
  getDashboard(): Promise<QueueDashboardResponse> {
    return this.queue.getPgBossDashboard();
  }
}
