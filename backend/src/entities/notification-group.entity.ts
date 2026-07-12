import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { NotificationGroupMemberEntity } from "./notification-group-member.entity";
import { NotificationGroupRuleEntity } from "./notification-group-rule.entity";
import { UserEntity } from "./user.entity";

@Entity("notification_groups")
@Unique(["name"])
export class NotificationGroupEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdById!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "created_by" })
  createdBy!: UserEntity | null;

  @OneToMany(() => NotificationGroupMemberEntity, (m) => m.group)
  members!: NotificationGroupMemberEntity[];

  @OneToMany(() => NotificationGroupRuleEntity, (r) => r.group)
  rules!: NotificationGroupRuleEntity[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
