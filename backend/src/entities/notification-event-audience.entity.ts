import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { NotificationEventConfigEntity } from "./notification-event-config.entity";
import { RoleEntity } from "./role.entity";

/** How recipients are resolved when an event fires or a manual send runs. */
export type NotificationAudienceType =
  | "context_customer_portal_users"
  | "context_customer_admins"
  | "context_practice_staff_on_customer"
  | "all_portal_users"
  | "role"
  | "all_practice_staff_with_role";

@Entity("notification_event_audiences")
export class NotificationEventAudienceEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "event_config_id", type: "uuid" })
  eventConfigId!: string;

  @ManyToOne(() => NotificationEventConfigEntity, (c) => c.audiences, { onDelete: "CASCADE" })
  @JoinColumn({ name: "event_config_id" })
  eventConfig!: NotificationEventConfigEntity;

  @Column({ name: "audience_type", type: "varchar", length: 48 })
  audienceType!: NotificationAudienceType;

  /** Required when audience_type is `role` or `all_practice_staff_with_role`. */
  @Column({ name: "role_id", type: "uuid", nullable: true })
  roleId!: string | null;

  @ManyToOne(() => RoleEntity, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "role_id" })
  role!: RoleEntity | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
