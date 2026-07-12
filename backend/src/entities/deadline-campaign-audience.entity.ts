import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { NotificationAudienceType } from "./notification-event-audience.entity";
import { RoleEntity } from "./role.entity";
import { DeadlineCampaignEntity } from "./deadline-campaign.entity";

@Entity("deadline_campaign_audiences")
export class DeadlineCampaignAudienceEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "campaign_id", type: "uuid" })
  campaignId!: string;

  @ManyToOne(() => DeadlineCampaignEntity, (c) => c.audiences, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign!: DeadlineCampaignEntity;

  @Column({ name: "audience_type", type: "varchar", length: 48 })
  audienceType!: NotificationAudienceType;

  @Column({ name: "role_id", type: "uuid", nullable: true })
  roleId!: string | null;

  @ManyToOne(() => RoleEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "role_id" })
  role!: RoleEntity | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
