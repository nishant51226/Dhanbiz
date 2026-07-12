import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { NotificationEventConfigEntity } from "./notification-event-config.entity";
import { UserEntity } from "./user.entity";

/** Per-user inbox row (in-app bell + optional push payload). */
@Entity("user_notifications")
export class UserNotificationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ name: "event_config_id", type: "uuid", nullable: true })
  eventConfigId!: string | null;

  @ManyToOne(() => NotificationEventConfigEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "event_config_id" })
  eventConfig!: NotificationEventConfigEntity | null;

  @Column({ name: "event_key", type: "varchar", length: 64, nullable: true })
  eventKey!: string | null;

  @Column({ type: "varchar", length: 200 })
  name!: string;

  @Column({ type: "text" })
  body!: string;

  @Column({ type: "varchar", length: 64 })
  type!: string;

  @Column({ name: "image_url", type: "text", nullable: true })
  imageUrl!: string | null;

  @Column({ type: "jsonb", default: () => "'{}'" })
  data!: Record<string, unknown>;

  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
