import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

import { User } from "../users/user.entity";
import { ClientType } from "./auth.types";

@Entity({ name: "auth_sessions" })
@Index("idx_auth_sessions_user_id", ["userId"])
@Index("idx_auth_sessions_expires_at", ["expiresAt"])
export class AuthSession {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ type: "varchar", length: 128 })
  refreshTokenHash!: string;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "boolean", default: false })
  isRevoked!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  userAgent!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: "varchar", length: 20, default: "web" })
  clientType!: ClientType;

  @Column({ type: "timestamptz", nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
