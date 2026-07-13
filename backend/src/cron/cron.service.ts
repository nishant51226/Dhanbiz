import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { DEADLINE_CAMPAIGN_TIMEZONE } from "../notification/deadline-campaign-date-fields";
import { DeadlineCampaignService } from "../notification/deadline-campaign.service";
import { QueueService } from "../queue/queue.service";

@Injectable()
export class CronService {
  private readonly log = new Logger(CronService.name);

  constructor(
    private readonly queue: QueueService,
    private readonly deadlineCampaigns: DeadlineCampaignService,
  ) {}

  /** Every minute — evaluate deadline notification campaigns (Asia/Kolkata send slots). */
  @Cron("0 * * * * *", { timeZone: DEADLINE_CAMPAIGN_TIMEZONE })
  async runDeadlineCampaigns(): Promise<void> {
    try {
      await this.deadlineCampaigns.runDueCampaigns();
    } catch (e) {
      this.log.error(
        `Deadline campaigns cron failed: ${e instanceof Error ? e.stack ?? e.message : e}`,
      );
    }
  }

  /** Every 2 minutes — re-enqueue extraction jobs orphaned in `queued`. */
  @Cron("0 */2 * * * *")
  async recoverOrphanExtractionJobs(): Promise<void> {
    try {
      await this.queue.recoverStaleExtractionJobs();
    } catch (e) {
      this.log.error(
        `Orphan extraction job recovery failed: ${e instanceof Error ? e.stack ?? e.message : e}`,
      );
    }
  }
}
