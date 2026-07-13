import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { DataSource } from "typeorm";

import { Customer } from "../entities/customer.entity";
import { DEADLINE_CAMPAIGN_TIMEZONE } from "../notification/deadline-campaign-date-fields";
import { DeadlineCampaignService } from "../notification/deadline-campaign.service";
import { QueueService } from "../queue/queue.service";
import { runWithAdminRls } from "../tenant/run-with-tenant-rls";

@Injectable()
export class CronService {
  private readonly log = new Logger(CronService.name);

  constructor(
    private readonly dataSource: DataSource,
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

  /** Daily at midnight UK — legacy customer data queue (existing behaviour). */
  @Cron("0 0 0 * * *", {
    timeZone: "Europe/London",
  })
  async testQueueFlow(): Promise<void> {
    this.log.log("Cron: listing all customers…");
    try {
      const customers = await runWithAdminRls(this.dataSource, async (manager) => {
        return manager.getRepository(Customer).find({
          select: { id: true, name: true, accountStatus: true },
          order: { name: "ASC" },
        });
      });
      this.log.log(`Cron: ${customers.length} customer(s) total`);
      for (const c of customers) {
        this.log.log(`Cron: customer id=${c.id} name="${c.name}" status=${c.accountStatus}`);
        try {
          const pgBossId = await this.queue.enqueueCustomersData(c.id);
          this.log.log(`Cron: queued customers_data for ${c.id} (pgBossId=${pgBossId})`);
        } catch (err) {
          this.log.warn(
            `Cron: enqueue customers_data failed for ${c.id}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    } catch (e) {
      this.log.error(e instanceof Error ? e.stack ?? e.message : e);
    }
  }
}
