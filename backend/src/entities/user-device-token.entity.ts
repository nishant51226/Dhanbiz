import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserEntity } from "./user.entity";

@Entity("user_device_tokens")
export class UserDeviceTokenEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ name: "firebase_token", type: "text" })
  firebaseToken!: string;

  @Column({ name: "device_type", type: "varchar", length: 20, nullable: true })
  deviceType!: string | null;

  @Column({ name: "device_id", type: "text", nullable: true })
  deviceId!: string | null;

  @Column({ name: "app_version", type: "varchar", length: 50, nullable: true })
  appVersion!: string | null;

  @Column({ name: "is_active", type: "boolean", default: () => "true" })
  isActive!: boolean;

  @Column({ name: "last_used_at", type: "timestamptz", default: () => "now()" })
  lastUsedAt!: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
