import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { NotificationGroupEntity } from "./notification-group.entity";
import { UserEntity } from "./user.entity";

@Entity("notification_group_members")
@Unique(["groupId", "userId"])
export class NotificationGroupMemberEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "group_id", type: "uuid" })
  groupId!: string;

  @ManyToOne(() => NotificationGroupEntity, (g) => g.members, { onDelete: "CASCADE" })
  @JoinColumn({ name: "group_id" })
  group!: NotificationGroupEntity;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
