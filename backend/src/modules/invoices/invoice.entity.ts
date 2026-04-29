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

import { Customer } from "../customers/customer.entity";
import { User } from "../users/user.entity";
import {
  INVOICE_ORDER_TYPES,
  INVOICE_STATUSES,
  INVOICE_PAYMENT_MODES,
  KITCHEN_STATUSES,
  type KitchenStatus,
  type InvoicePaymentMode,
  type InvoiceOrderType,
  type InvoiceStatus
} from "./invoices.constants";

@Index("IDX_invoices_invoice_number_unique", ["invoiceNumber"], { unique: true })
@Index("IDX_invoices_idempotency_key_unique", ["idempotencyKey"], { unique: true })
@Entity({ name: "invoices" })
export class Invoice {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 40 })
  invoiceNumber!: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  orderReference!: string | null;

  @Column({ type: "uuid", nullable: true })
  customerId!: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "customerId" })
  customer!: Customer | null;

  @Column({ type: "uuid" })
  staffId!: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "staffId" })
  staff!: User;

  @Column({ type: "varchar", length: 64, nullable: true })
  branchId!: string | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  deviceId!: string | null;

  @Column({ type: "enum", enum: INVOICE_ORDER_TYPES, default: "takeaway" })
  orderType!: InvoiceOrderType;

  @Column({ type: "varchar", length: 40, nullable: true })
  tableLabel!: string | null;

  @Column({ type: "enum", enum: KITCHEN_STATUSES, default: "not_sent" })
  kitchenStatus!: KitchenStatus;

  @Column({ type: "enum", enum: INVOICE_STATUSES, default: "paid" })
  status!: InvoiceStatus;

  @Column({ type: "enum", enum: INVOICE_PAYMENT_MODES, default: "cash" })
  paymentMode!: InvoicePaymentMode;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  itemDiscountAmount!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  couponDiscountAmount!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  manualDiscountAmount!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  taxAmount!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  totalAmount!: number;

  @Column({ type: "varchar", length: 60, nullable: true })
  couponCode!: string | null;

  @Column({ type: "varchar", length: 800, nullable: true })
  notes!: string | null;

  @Column({ type: "jsonb", nullable: true })
  customerSnapshot!: Record<string, unknown> | null;

  @Column({ type: "jsonb", nullable: true })
  totalsSnapshot!: Record<string, unknown> | null;

  @Column({ type: "jsonb", nullable: true })
  linesSnapshot!: Record<string, unknown> | null;

  @Column({ type: "boolean", default: false })
  syncedFromPos!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  sourceCreatedAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: "varchar", length: 400, nullable: true })
  cancelledReason!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  refundedAt!: Date | null;

  @Column({ type: "varchar", length: 400, nullable: true })
  refundedReason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
