import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";

import { INVOICE_LINE_TYPES, type InvoiceLineType } from "./invoices.constants";
import { Invoice } from "./invoice.entity";

@Index("IDX_invoice_lines_invoice_id", ["invoiceId"])
@Entity({ name: "invoice_lines" })
export class InvoiceLine {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  invoiceId!: string;

  @ManyToOne(() => Invoice, { onDelete: "CASCADE" })
  @JoinColumn({ name: "invoiceId" })
  invoice!: Invoice;

  @Column({ type: "enum", enum: INVOICE_LINE_TYPES })
  lineType!: InvoiceLineType;

  @Column({ type: "uuid", nullable: true })
  referenceId!: string | null;

  @Column({ type: "varchar", length: 180 })
  nameSnapshot!: string;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  quantity!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  unitPrice!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  discountAmount!: number;

  @Column({ type: "numeric", precision: 6, scale: 2, default: 0 })
  gstPercentage!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  lineTotal!: number;

  @Column({ type: "jsonb", nullable: true })
  meta!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}

