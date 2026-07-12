import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequireAnyPermission, RequirePermission } from "../auth/require-permission.decorator";
import { CustomerFormSubmissionStatus } from "../entities/customer-form-submission.entity";
import {
  DocusealRemoteSignatureService,
  type DocusealSignatureTarget,
} from "../docuseal/docuseal-remote-signature.service";
import { CustomerFormSubmissionsService } from "./customer-form-submissions.service";

type CreateFormSubmissionBody = { data?: Record<string, unknown>; wizardStep?: number };

type PatchFormSubmissionBody = {
  data?: Record<string, unknown>;
  status?: string;
  wizardStep?: number;
};

type BatchStatusesBody = { customerIds?: string[] };

const DOCUSEAL_SIGNATURE_TARGETS = new Set<string>([
  "client_registration",
  "hmrc_64_8",
  "change_accountant",
  "direct_debit",
]);

type SendSignatureEmailBody = {
  recipientEmail?: string;
  recipientName?: string;
  role?: string;
  fieldValues?: Record<string, string | boolean | number>;
  /** Which wizard signature slot this DocuSeal submission fills (default: client registration / step 1). */
  signatureTarget?: string;
};

const MAX_BATCH_IDS = 100;

function filterIdsForUser(user: AuthUser | undefined, ids: string[]): string[] {
  const raw = (ids ?? []).filter((id) => typeof id === "string" && id.length > 0).slice(0, MAX_BATCH_IDS);
  if (!user) return [];
  if (user.isAdmin) return raw;
  if (user.customerId) return raw.filter((id) => id === user.customerId);
  return [];
}

type AuthedRequest = Request & { user?: AuthUser };

@ApiBearerAuth("bearer")
@Controller("customers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomerFormSubmissionsController {
  constructor(
    private readonly service: CustomerFormSubmissionsService,
    private readonly docusealRemote: DocusealRemoteSignatureService
  ) {}

  /** Static path must stay before :customerId routes. */
  @Post("form-submission-statuses")
  @RequireAnyPermission("customer:read", "portal:file:read", "portal:file:write")
  async batchStatuses(@Body() body: BatchStatusesBody, @Req() req: AuthedRequest) {
    const filtered = filterIdsForUser(req.user, body?.customerIds ?? []);
    const statuses = await this.service.getLatestStatusByCustomerIds(filtered);
    return { statuses };
  }

  @Get(":customerId/form-submissions/latest")
  @RequireAnyPermission("customer:read", "portal:file:read", "portal:file:write")
  async latest(@Param("customerId", ParseUUIDPipe) customerId: string) {
    const row = await this.service.findLatestByCustomerId(customerId);
    if (!row) {
      throw new NotFoundException("No form submission for this customer");
    }
    return row;
  }

  /**
   * Create a DocuSeal submission, email the client a signing link, and mark this form row pending
   * until the webhook receives the completed signature.
   */
  @Post(":customerId/form-submissions/:submissionId/signature-email-request")
  @RequirePermission("customer:write")
  async sendSignatureEmail(
    @Param("customerId", ParseUUIDPipe) customerId: string,
    @Param("submissionId", ParseUUIDPipe) submissionId: string,
    @Body() body: SendSignatureEmailBody
  ) {
    const email = String(body?.recipientEmail ?? "").trim();
    if (!email) {
      throw new BadRequestException("recipientEmail is required");
    }
    const fieldValues =
      body?.fieldValues !== undefined &&
      body.fieldValues !== null &&
      typeof body.fieldValues === "object" &&
      !Array.isArray(body.fieldValues)
        ? (body.fieldValues as Record<string, string | boolean | number>)
        : undefined;
    const rawTarget = body?.signatureTarget;
    const signatureTarget: DocusealSignatureTarget =
      typeof rawTarget === "string" && DOCUSEAL_SIGNATURE_TARGETS.has(rawTarget)
        ? (rawTarget as DocusealSignatureTarget)
        : "client_registration";
    return this.docusealRemote.sendClientRegistrationSignatureRequest({
      customerId,
      submissionId,
      recipientEmail: email,
      recipientName: body?.recipientName,
      role: body?.role,
      signatureTarget,
      fieldValues,
    });
  }

  @Post(":customerId/form-submissions")
  @RequirePermission("customer:write")
  create(
    @Param("customerId", ParseUUIDPipe) customerId: string,
    @Body() body: CreateFormSubmissionBody
  ) {
    const data = body?.data;
    const payload =
      data !== undefined && data !== null && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const ws = body?.wizardStep;
    const wizardStep =
      typeof ws === "number" && Number.isInteger(ws) && ws >= 1 && ws <= 4 ? ws : undefined;
    return this.service.createDraft(customerId, payload, wizardStep);
  }

  @Patch(":customerId/form-submissions/:submissionId")
  @RequirePermission("customer:write")
  patch(
    @Param("customerId", ParseUUIDPipe) customerId: string,
    @Param("submissionId", ParseUUIDPipe) submissionId: string,
    @Body() body: PatchFormSubmissionBody
  ) {
    let status: CustomerFormSubmissionStatus | undefined;
    if (body.status === "completed") status = CustomerFormSubmissionStatus.completed;
    else if (body.status === "draft") status = CustomerFormSubmissionStatus.draft;
    const ws = body?.wizardStep;
    const wizardStep =
      typeof ws === "number" && Number.isInteger(ws) && ws >= 1 && ws <= 4 ? ws : undefined;
    return this.service.update(customerId, submissionId, {
      data: body.data,
      status,
      wizardStep,
    });
  }
}
