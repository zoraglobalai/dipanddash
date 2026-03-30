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
import {
  INVOICE_ACTIVITY_TYPES,
  type InvoiceActivityType
} from "./invoices.constants";
import { Invoice } from "./invoice.entity";

@Index("IDX_invoice_activities_invoice_id", ["invoiceId"])
@Entity({ name: "invoice_activities" })
export class InvoiceActivity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  invoiceId!: string;

  @ManyToOne(() => Invoice, { onDelete: "CASCADE" })
  @JoinColumn({ name: "invoiceId" })
  invoice!: Invoice;

  @Column({ type: "enum", enum: INVOICE_ACTIVITY_TYPES })
  actionType!: InvoiceActivityType;

  @Column({ type: "varchar", length: 400, nullable: true })
  reason!: string | null;

  @Column({ type: "uuid", nullable: true })
  performedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "performedByUserId" })
  performedByUser!: User | null;

  @Column({ type: "jsonb", nullable: true })
  payload!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}

