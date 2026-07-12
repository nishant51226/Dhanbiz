import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Customer } from "./customer.entity";
import { NotificationGroupEntity } from "./notification-group.entity";

/** Same filter ids as broadcast recipient user picker. */
export type NotificationGroupRuleFilter =
  | "practice_admin"
  | "practice_managers"
  | "practice_accountants"
  | "portal_admins"
  | "portal_users"
  | "portal_all";

@Entity("notification_group_rules")
export class NotificationGroupRuleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "group_id", type: "uuid" })
  groupId!: string;

  @ManyToOne(() => NotificationGroupEntity, (g) => g.rules, { onDelete: "CASCADE" })
  @JoinColumn({ name: "group_id" })
  group!: NotificationGroupEntity;

  @Column({ type: "varchar", length: 32 })
  filter!: NotificationGroupRuleFilter;

  /** Optional scope for portal rules (all portal users for one customer). */
  @Column({ name: "customer_id", type: "uuid", nullable: true })
  customerId!: string | null;

  @ManyToOne(() => Customer, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
