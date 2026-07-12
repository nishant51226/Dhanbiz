import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { roleHasPermission } from "../admin/role-permission.util.js";
import { CustomerUserEntity } from "../entities/customer-user.entity";
import { NotificationDispatchService } from "./notification-dispatch.service";

export type FileUploadNotifierContext = {
  uploadedByUserId: string;
  /** Practice staff when JWT has no portal `customerId`. */
  uploaderIsPracticeStaff: boolean;
  customerId: string;
  fileId: string;
  fileName: string;
};

type PendingUploadBatch = {
  customerId: string;
  uploadedByUserId: string;
  uploaderIsPracticeStaff: boolean;
  files: Array<{ fileId: string; fileName: string }>;
  timer: ReturnType<typeof setTimeout>;
};

/** Coalesce rapid uploads (e.g. batch complete) into one customer notification. */
const UPLOAD_NOTIFY_DEBOUNCE_MS = 2_500;

/**
 * Customer admins are notified when practice staff upload for a customer,
 * or when a non-admin portal user uploads. Uploads by customer admins do not notify.
 */
@Injectable()
export class FileUploadNotificationService implements OnModuleDestroy {
  private readonly log = new Logger(FileUploadNotificationService.name);
  private readonly pending = new Map<string, PendingUploadBatch>();

  constructor(
    @InjectRepository(CustomerUserEntity)
    private readonly customerUsers: Repository<CustomerUserEntity>,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  onModuleDestroy(): void {
    for (const key of [...this.pending.keys()]) {
      void this.flushPending(key);
    }
  }

  maybeNotifyCustomerAdmins(ctx: FileUploadNotifierContext): void {
    const customerId = ctx.customerId?.trim();
    const uploadedByUserId = ctx.uploadedByUserId?.trim();
    const fileId = ctx.fileId?.trim();
    const fileName = ctx.fileName?.trim();
    if (!customerId || !uploadedByUserId || !fileId || !fileName) return;

    const key = `${customerId}\0${uploadedByUserId}\0${ctx.uploaderIsPracticeStaff ? "1" : "0"}`;
    let entry = this.pending.get(key);
    if (entry) {
      clearTimeout(entry.timer);
      entry.files.push({ fileId, fileName });
    } else {
      entry = {
        customerId,
        uploadedByUserId,
        uploaderIsPracticeStaff: ctx.uploaderIsPracticeStaff,
        files: [{ fileId, fileName }],
        timer: setTimeout(() => {
          void this.flushPending(key);
        }, UPLOAD_NOTIFY_DEBOUNCE_MS),
      };
      this.pending.set(key, entry);
      return;
    }

    entry.timer = setTimeout(() => {
      void this.flushPending(key);
    }, UPLOAD_NOTIFY_DEBOUNCE_MS);
  }

  private async flushPending(key: string): Promise<void> {
    const entry = this.pending.get(key);
    if (!entry) return;
    this.pending.delete(key);
    clearTimeout(entry.timer);

    const count = entry.files.length;
    const first = entry.files[0];
    if (!first) return;

    try {
      await this.notifyIfEligible({
        customerId: entry.customerId,
        uploadedByUserId: entry.uploadedByUserId,
        uploaderIsPracticeStaff: entry.uploaderIsPracticeStaff,
        fileId: first.fileId,
        fileName: first.fileName,
        fileCount: count,
      });
    } catch (err) {
      this.log.warn(
        `file.uploaded notification failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async notifyIfEligible(
    ctx: FileUploadNotifierContext & { fileCount: number },
  ): Promise<void> {
    const customerId = ctx.customerId?.trim();
    const uploadedByUserId = ctx.uploadedByUserId?.trim();
    if (!customerId || !uploadedByUserId) return;

    if (!ctx.uploaderIsPracticeStaff) {
      const isCustomerAdmin = await this.isCustomerAdminForCustomer(uploadedByUserId, customerId);
      if (isCustomerAdmin) return;
    }

    const fileCount = Math.max(1, ctx.fileCount);
    const uploadSummary = fileCount === 1 ? ctx.fileName.trim() : `${fileCount} files`;

    await this.dispatch.dispatch("file.uploaded", {
      customerId,
      fileId: ctx.fileId,
      fileName: fileCount === 1 ? ctx.fileName.trim() : uploadSummary,
      fileCount: String(fileCount),
      uploadSummary,
      excludeUserId: uploadedByUserId,
    }).then((report) => {
      if (report.recipientCount === 0) {
        this.log.log(
          `file.uploaded skipped customerId=${customerId} summary="${uploadSummary}" (no recipients)`,
        );
        return;
      }

      this.log.log(
        `file.uploaded customerId=${customerId} summary="${uploadSummary}" count=${fileCount} excludedUploader=${uploadedByUserId} recipients=${report.recipientCount} mobilePush=${report.pushSummary.sent} noToken=${report.pushSummary.noTokens}`,
      );
      for (const recipient of report.recipients) {
        this.log.log(
          `file.uploaded delivery email=${recipient.email} push=${recipient.push} tokens=${recipient.deviceTokenCount} inApp=${recipient.inApp}`,
        );
      }
    });
  }

  private async isCustomerAdminForCustomer(userId: string, customerId: string): Promise<boolean> {
    const row = await this.customerUsers.findOne({
      where: { userId, customerId, isActive: true },
      relations: { role: true },
    });
    if (!row?.role) return false;
    return roleHasPermission(row.role.permissions, "portal:user:write");
  }
}
