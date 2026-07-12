import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { RoleType } from "../admin/role-types.js";

@Entity("roles")
export class RoleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 128 })
  name!: string;

  @Column({ name: "role_type", type: "varchar", length: 16, default: "staff" })
  roleType!: RoleType;

  @Column({ name: "is_system", type: "boolean", default: false })
  isSystem!: boolean;

  @Column({ type: "varchar", length: 512, nullable: true })
  description!: string | null;

  @Column({ type: "jsonb", default: () => "'[]'" })
  permissions!: string[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}

