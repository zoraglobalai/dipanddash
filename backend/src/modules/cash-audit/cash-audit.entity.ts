import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

import { User } from "../users/user.entity";
import type { CashDenominationCounts } from "./cash-audit.constants";

@Entity({ name: "cash_audits" })
export class CashAudit {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "date" })
  auditDate!: string;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  denominationCounts!: CashDenominationCounts;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  countedAmount!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  staffCashTakenAmount!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  enteredCardAmount!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  enteredUpiAmount!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  expectedCashAmount!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  expectedCardAmount!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  expectedUpiAmount!: number;

  @Column({ type: "varchar", length: 500, nullable: true })
  note!: string | null;

  @Column({ type: "uuid" })
  createdByUserId!: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "createdByUserId" })
  createdByUser!: User;

  @Column({ type: "uuid" })
  approvedByAdminId!: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "approvedByAdminId" })
  approvedByAdmin!: User;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
