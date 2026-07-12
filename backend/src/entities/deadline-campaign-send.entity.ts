import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export type DeadlineCampaignPhase = "upcoming" | "overdue";

@Entity("deadline_campaign_sends")
@Index(
  "UQ_deadline_campaign_sends_dedup",
  ["campaignId", "customerId", "dueDate", "phase", "sendDate", "sendSlot"],
  { unique: true },
)
export class DeadlineCampaignSendEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "campaign_id", type: "uuid" })
  campaignId!: string;

  @Column({ name: "customer_id", type: "uuid" })
  customerId!: string;

  @Column({ name: "due_date", type: "date" })
  dueDate!: string;

  @Column({ type: "varchar", length: 16 })
  phase!: DeadlineCampaignPhase;

  @Column({ name: "send_date", type: "date" })
  sendDate!: string;

  /** `HH:MM` London slot, or `once` for one-time sends. */
  @Column({ name: "send_slot", type: "varchar", length: 8 })
  sendSlot!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
