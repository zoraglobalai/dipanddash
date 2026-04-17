import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";

import { User } from "../users/user.entity";

export const PENDING_SOURCE_TYPES = ["invoice", "gaming_booking"] as const;
export type PendingSourceType = (typeof PENDING_SOURCE_TYPES)[number];

@Index("IDX_pending_payment_histories_source", ["sourceType", "sourceId"])
@Index("IDX_pending_payment_histories_customer_phone", ["customerPhone"])
@Index("IDX_pending_payment_histories_created_at", ["createdAt"])
@Entity({ name: "pending_payment_histories" })
export class PendingPaymentHistory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 24 })
  sourceType!: PendingSourceType;

  @Column({ type: "uuid" })
  sourceId!: string;

  @Column({ type: "varchar", length: 64 })
  sourceNumber!: string;

  @Column({ type: "varchar", length: 120 })
  customerName!: string;

  @Column({ type: "varchar", length: 24 })
  customerPhone!: string;

  @Column({ type: "varchar", length: 20 })
  mode!: "cash" | "card" | "upi";

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  amount!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  remainingAmount!: number;

  @Column({ type: "varchar", length: 120, nullable: true })
  referenceNo!: string | null;

  @Column({ type: "varchar", length: 400, nullable: true })
  note!: string | null;

  @Column({ type: "uuid", nullable: true })
  collectedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "collectedByUserId" })
  collectedBy!: User | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}

