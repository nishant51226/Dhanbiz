import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Readable } from "node:stream";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import { RequirePermission } from "../auth/require-permission.decorator.js";
import { CustomerDocumentsExportJobService } from "./customer-documents-export-job.service.js";
import { CustomerDocumentsReportDto } from "./dto/customer-documents-report.dto.js";
import { CustomerDocumentsReportService } from "./customer-documents-report.service.js";

type AuthedRequest = Request & { user?: AuthUser };

@ApiTags("admin")
@ApiBearerAuth("bearer")
@Controller("admin/reports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("report:read")
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AdminReportsController {
  constructor(
    private readonly exportJobs: CustomerDocumentsExportJobService,
    private readonly report: CustomerDocumentsReportService,
  ) {}

  @Get("customer-documents-export/candidates")
  @ApiOperation({
    summary: "List documents available for extraction report export",
    description:
      "Returns library documents in the selected customer and date range. Use with invoice register and per-document layouts.",
  })
  listCustomerDocumentsExportCandidates(@Query() query: CustomerDocumentsReportDto) {
    return this.report.listExportCandidates(query);
  }

  @Post("customer-documents-export")
  @ApiOperation({
    summary: "Queue extraction report Excel export",
    description:
      "Builds the workbook in the background. You are notified when the file is ready to download.",
  })
  async queueCustomerDocumentsExport(@Body() body: CustomerDocumentsReportDto, @Req() req: AuthedRequest) {
    return this.exportJobs.queueExport(body, req.user!);
  }

  @Get("customer-documents-exports/:exportId")
  @ApiOperation({ summary: "Get customer documents export job status" })
  getCustomerDocumentsExport(@Param("exportId", ParseUUIDPipe) exportId: string, @Req() req: AuthedRequest) {
    return this.exportJobs.getExportForUser(exportId, req.user);
  }

  @Get("customer-documents-exports/:exportId/download")
  @ApiOperation({ summary: "Download completed customer documents Excel export" })
  async downloadCustomerDocumentsExport(
    @Param("exportId", ParseUUIDPipe) exportId: string,
    @Req() req: AuthedRequest,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.exportJobs.getDownloadFile(exportId, req.user);
    const safeName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "customer_documents.xlsx";
    return new StreamableFile(Readable.from(buffer), {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      length: buffer.length,
      disposition: `attachment; filename="${safeName}"`,
    });
  }
}
