import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { DeadlineCampaignAudienceEntity } from "./deadline-campaign-audience.entity";

export type DeadlineCampaignScheduleMode = "once" | "daily_once" | "daily_multi";

@Entity("deadline_campaigns")
@Unique(["dateFieldId"])
export class DeadlineCampaignEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 128 })
  name!: string;

  @Column({ name: "date_field_id", type: "varchar", length: 80 })
  dateFieldId!: string;

  @Column({ name: "schedule_mode", type: "varchar", length: 16 })
  scheduleMode!: DeadlineCampaignScheduleMode;

  /** London-time slots as `HH:MM` (24h), computed from schedule fields. */
  @Column({ name: "send_times", type: "jsonb", default: () => "'[]'" })
  sendTimes!: string[];

  @Column({ name: "send_start_time", type: "varchar", length: 5, default: () => "'09:00'" })
  sendStartTime!: string;

  @Column({ name: "send_count_per_day", type: "int", default: () => "1" })
  sendCountPerDay!: number;

  @Column({ name: "send_interval_hours", type: "int", default: () => "4" })
  sendIntervalHours!: number;

  @Column({ name: "upcoming_enabled", type: "boolean", default: () => "true" })
  upcomingEnabled!: boolean;

  @Column({ name: "upcoming_lead_days", type: "int", default: () => "30" })
  upcomingLeadDays!: number;

  @Column({ name: "overdue_enabled", type: "boolean", default: () => "true" })
  overdueEnabled!: boolean;

  @Column({ name: "overdue_lead_days", type: "int", default: () => "14" })
  overdueLeadDays!: number;

  @Column({ name: "upcoming_title_template", type: "varchar", length: 200 })
  upcomingTitleTemplate!: string;

  @Column({ name: "upcoming_body_template", type: "text" })
  upcomingBodyTemplate!: string;

  @Column({ name: "overdue_title_template", type: "varchar", length: 200 })
  overdueTitleTemplate!: string;

  @Column({ name: "overdue_body_template", type: "text" })
  overdueBodyTemplate!: string;

  @Column({ name: "default_link_url", type: "varchar", length: 512, nullable: true })
  defaultLinkUrl!: string | null;

  @Column({ name: "group_ids", type: "jsonb", default: () => "'[]'" })
  groupIds!: string[];

  @Column({ name: "is_enabled", type: "boolean", default: () => "true" })
  isEnabled!: boolean;

  @Column({ name: "push_enabled", type: "boolean", default: () => "true" })
  pushEnabled!: boolean;

  @Column({ name: "in_app_enabled", type: "boolean", default: () => "true" })
  inAppEnabled!: boolean;

  @Column({ name: "sort_order", type: "int", default: () => "0" })
  sortOrder!: number;

  @OneToMany(() => DeadlineCampaignAudienceEntity, (a) => a.campaign)
  audiences!: DeadlineCampaignAudienceEntity[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
