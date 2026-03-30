import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";

import {
  PAYMENT_MODES,
  PAYMENT_STATUSES,
  type PaymentMode,
  type PaymentStatus
} from "./invoices.constants";
import { Invoice } from "./invoice.entity";

@Index("IDX_invoice_payments_invoice_id", ["invoiceId"])
@Entity({ name: "invoice_payments" })
export class InvoicePayment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  invoiceId!: string;

  @ManyToOne(() => Invoice, { onDelete: "CASCADE" })
  @JoinColumn({ name: "invoiceId" })
  invoice!: Invoice;

  @Column({ type: "enum", enum: PAYMENT_MODES })
  mode!: PaymentMode;

  @Column({ type: "enum", enum: PAYMENT_STATUSES, default: "success" })
  status!: PaymentStatus;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  amount!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, nullable: true })
  receivedAmount!: number | null;

  @Column({ type: "numeric", precision: 12, scale: 2, nullable: true })
  changeAmount!: number | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  referenceNo!: string | null;

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  paidAt!: Date;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}

