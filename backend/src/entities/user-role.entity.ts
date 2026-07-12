import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { RoleEntity } from "./role.entity";
import { UserEntity } from "./user.entity";

@Entity("user_roles")
@Unique(["userId", "roleId"])
export class UserRoleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ name: "role_id", type: "uuid" })
  roleId!: string;

  @ManyToOne(() => RoleEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "role_id" })
  role!: RoleEntity;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}

