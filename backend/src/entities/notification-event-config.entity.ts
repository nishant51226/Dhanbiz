import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { NotificationEventAudienceEntity } from "./notification-event-audience.entity";

export type NotificationTriggerType = "event" | "manual";

@Entity("notification_event_configs")
@Unique(["eventKey"])
export class NotificationEventConfigEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Stable key, e.g. `file.uploaded` — referenced by app code. */
  @Column({ name: "event_key", type: "varchar", length: 64 })
  eventKey!: string;

  @Column({ type: "varchar", length: 128 })
  label!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "trigger_type", type: "varchar", length: 16, default: () => "'event'" })
  triggerType!: NotificationTriggerType;

  @Column({ name: "title_template", type: "varchar", length: 200 })
  titleTemplate!: string;

  @Column({ name: "body_template", type: "text" })
  bodyTemplate!: string;

  @Column({ name: "image_url_template", type: "text", nullable: true })
  imageUrlTemplate!: string | null;

  @Column({ name: "default_link_url", type: "varchar", length: 2048, nullable: true })
  defaultLinkUrl!: string | null;

  @Column({ name: "is_enabled", type: "boolean", default: () => "true" })
  isEnabled!: boolean;

  @Column({ name: "push_enabled", type: "boolean", default: () => "true" })
  pushEnabled!: boolean;

  @Column({ name: "in_app_enabled", type: "boolean", default: () => "true" })
  inAppEnabled!: boolean;

  /** UI hint: placeholder names available for this event. */
  @Column({ name: "available_placeholders", type: "jsonb", default: () => "'[]'" })
  availablePlaceholders!: string[];

  @Column({ name: "sort_order", type: "int", default: () => "0" })
  sortOrder!: number;

  @OneToMany(() => NotificationEventAudienceEntity, (a) => a.eventConfig)
  audiences!: NotificationEventAudienceEntity[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
