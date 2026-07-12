import { Injectable, Logger } from "@nestjs/common";
import { NotificationDispatchService } from "./notification-dispatch.service";

export type FileAssigneeNotifierContext = {
  documentId: string;
  fileId: string;
  fileName: string;
  customerId: string;
  assigneeUserIds: string[];
  assignedByUserId?: string | null;
};

/** Notify accountants when they are newly assigned to a library document. */
@Injectable()
export class FileAssigneeNotificationService {
  private readonly log = new Logger(FileAssigneeNotificationService.name);

  constructor(private readonly dispatch: NotificationDispatchService) {}

  async notifyNewAssignees(ctx: FileAssigneeNotifierContext): Promise<void> {
    const assigneeUserIds = [...new Set(ctx.assigneeUserIds.map((id) => id.trim()).filter(Boolean))];
    if (assigneeUserIds.length === 0) return;

    const fileName = ctx.fileName.trim() || "A file";
    try {
      const report = await this.dispatch.dispatchToExplicitUsers("file.assigned", assigneeUserIds, {
        customerId: ctx.customerId,
        documentId: ctx.documentId,
        fileId: ctx.fileId,
        fileName,
        excludeUserId: ctx.assignedByUserId?.trim() || undefined,
      });

      if (report.recipientCount === 0) {
        this.log.log(
          `file.assigned skipped documentId=${ctx.documentId} fileName="${fileName}" (no recipients)`,
        );
        return;
      }

      this.log.log(
        `file.assigned documentId=${ctx.documentId} fileName="${fileName}" recipients=${report.recipientCount} mobilePush=${report.pushSummary.sent} noToken=${report.pushSummary.noTokens}`,
      );
      for (const recipient of report.recipients) {
        this.log.log(
          `file.assigned delivery email=${recipient.email} push=${recipient.push} tokens=${recipient.deviceTokenCount} inApp=${recipient.inApp}`,
        );
      }
    } catch (err) {
      this.log.warn(
        `file.assigned notification failed documentId=${ctx.documentId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
