import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Readable } from "node:stream";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import { RequirePermission } from "../auth/require-permission.decorator.js";
import { FileActivityAction } from "../entities/file-activity-log.entity.js";
import { FileActivityReportService } from "./file-activity-report.service.js";

@ApiTags("admin")
@ApiBearerAuth("bearer")
@Controller("admin/reports/file-activity")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("report:read")
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AdminFileActivityReportController {
  constructor(private readonly reports: FileActivityReportService) {}

  @Get()
  @ApiOperation({ summary: "Paginated file activity log" })
  list(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("customerId") customerId?: string,
    @Query("documentId") documentId?: string,
    @Query("fileId") fileId?: string,
    @Query("action") action?: FileActivityAction,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("search") search?: string,
  ) {
    return this.reports.list({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      customerId,
      documentId,
      fileId,
      action,
      from,
      to,
      search,
    });
  }

  @Get("export")
  @ApiOperation({
    summary: "Download file activity log as CSV",
    description: `Exports up to ${10_000} rows matching the same filters as the list endpoint.`,
  })
  async exportCsv(
    @Query("customerId") customerId?: string,
    @Query("documentId") documentId?: string,
    @Query("fileId") fileId?: string,
    @Query("action") action?: FileActivityAction,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("search") search?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.reports.exportCsv({
      customerId,
      documentId,
      fileId,
      action,
      from,
      to,
      search,
    });
    const safeName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "file_activity.csv";
    return new StreamableFile(Readable.from(buffer), {
      type: "text/csv; charset=utf-8",
      length: buffer.length,
      disposition: `attachment; filename="${safeName}"`,
    });
  }

  @Get("documents/:documentId/summary")
  @ApiOperation({ summary: "Files library document header for activity report" })
  documentSummary(@Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.reports.documentSummary(documentId);
  }

  @Get("documents/:documentId/export")
  @ApiOperation({
    summary: "Download activity timeline CSV for one Files library document",
    description: "Exports all events for the document (chronological), optionally filtered by action and date range.",
  })
  async exportDocumentCsv(
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Query("action") action?: FileActivityAction,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.reports.exportDocumentCsv(documentId, { action, from, to });
    const safeName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "file_activity.csv";
    return new StreamableFile(Readable.from(buffer), {
      type: "text/csv; charset=utf-8",
      length: buffer.length,
      disposition: `attachment; filename="${safeName}"`,
    });
  }

  @Get("documents/:documentId")
  @ApiOperation({ summary: "Full activity timeline for one Files library document" })
  documentTimeline(@Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.reports.documentTimeline(documentId);
  }
}
