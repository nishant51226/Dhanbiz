import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Readable } from "node:stream";
import { CustomerDocumentsReportService } from "./customer-documents-report.service.js";
import { verifyReportDocumentDownload } from "./report-document-download.util.js";

/**
 * Public file download for Excel export hyperlinks (HMAC token; no JWT).
 * URLs are short so Excel opens them reliably.
 */
@ApiTags("admin")
@Controller("admin/reports")
export class AdminReportFilesController {
  constructor(private readonly reports: CustomerDocumentsReportService) {}

  @Get("documents/:documentId/file")
  @ApiOperation({
    summary: "Download a library document via signed report export link",
    description: "Used by hyperlinks embedded in customer document Excel exports. Token expires after 24h.",
  })
  async downloadDocumentFile(
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Query("customerId", ParseUUIDPipe) customerId: string,
    @Query("token") token?: string,
    @Query("exp") expRaw?: string,
  ): Promise<StreamableFile> {
    const exp = Number(expRaw);
    if (!token?.trim() || !Number.isFinite(exp)) {
      throw new BadRequestException("Invalid download link");
    }
    const { buffer, mimeType, filename } = await this.reports.streamDocumentForSignedDownload({
      documentId,
      customerId,
      token: token.trim(),
      expiresAtSec: exp,
    });
    const safeName = filename.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 200) || "document";
    return new StreamableFile(Readable.from(buffer), {
      type: mimeType,
      length: buffer.length,
      disposition: `inline; filename="${safeName.replace(/"/g, "")}"`,
    });
  }
}
