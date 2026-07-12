import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { UserEntity } from "./user.entity";

@Entity("refresh_tokens")
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ name: "token_hash", type: "varchar", length: 64 })
  tokenHash!: string;

  @Column({ name: "family_id", type: "uuid" })
  familyId!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  @Column({ name: "replaced_by_id", type: "uuid", nullable: true })
  replacedById!: string | null;

  @ManyToOne(() => RefreshTokenEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "replaced_by_id" })
  replacedBy!: RefreshTokenEntity | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
