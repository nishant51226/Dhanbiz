import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionResource } from "../auth/permission-resource.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { AiExecutionsService } from "../extraction/ai-executions.service.js";
import { TokenBurnReportQueryDto } from "./dto/token-burn-report-query.dto.js";
import { parseReportRange } from "./report-date.util.js";

@ApiBearerAuth("bearer")
@Controller("reports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@PermissionResource("report")
export class ReportsController {
  constructor(private readonly aiExecutions: AiExecutionsService) {}

  @Get("token-burn")
  tokenBurn(@Query() query: TokenBurnReportQueryDto) {
    const { from, to } = parseReportRange(query.from, query.to);
    return this.aiExecutions.getTokenBurnReport({
      from,
      to,
      customerId: query.customerId,
    });
  }
}
