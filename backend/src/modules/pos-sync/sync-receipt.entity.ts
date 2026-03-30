import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

@Index("IDX_sync_receipts_idempotency_unique", ["idempotencyKey"], { unique: true })
@Entity({ name: "sync_receipts" })
export class SyncReceipt {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 120 })
  idempotencyKey!: string;

  @Column({ type: "varchar", length: 60 })
  eventType!: string;

  @Column({ type: "varchar", length: 60, nullable: true })
  entityType!: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  entityId!: string | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  deviceId!: string | null;

  @Column({ type: "uuid", nullable: true })
  staffId!: string | null;

  @Column({ type: "varchar", length: 24, default: "processed" })
  status!: "processed" | "duplicate" | "failed";

  @Column({ type: "jsonb", nullable: true })
  requestPayload!: Record<string, unknown> | null;

  @Column({ type: "jsonb", nullable: true })
  responsePayload!: Record<string, unknown> | null;

  @Column({ type: "text", nullable: true })
  errorMessage!: string | null;

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  processedAt!: Date;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

