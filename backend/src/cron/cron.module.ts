import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { QueueModule } from "../queue/queue.module";
import { CronService } from "./cron.service";

@Module({
  imports: [QueueModule, NotificationModule],
  providers: [CronService],
})
export class CronModule {}
