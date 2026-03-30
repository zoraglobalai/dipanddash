import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";

import { Ingredient } from "../ingredients/ingredient.entity";
import { User } from "../users/user.entity";
import { Invoice } from "./invoice.entity";

@Index("IDX_invoice_usage_events_idempotency_unique", ["idempotencyKey"], { unique: true })
@Index("IDX_invoice_usage_events_invoice_id", ["invoiceId"])
@Entity({ name: "invoice_usage_events" })
export class InvoiceUsageEvent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: "uuid", nullable: true })
  invoiceId!: string | null;

  @ManyToOne(() => Invoice, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "invoiceId" })
  invoice!: Invoice | null;

  @Column({ type: "uuid", nullable: true })
  ingredientId!: string | null;

  @ManyToOne(() => Ingredient, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "ingredientId" })
  ingredient!: Ingredient | null;

  @Column({ type: "varchar", length: 180 })
  ingredientNameSnapshot!: string;

  @Column({ type: "numeric", precision: 14, scale: 6, default: 0 })
  consumedQuantity!: number;

  @Column({ type: "varchar", length: 24 })
  baseUnit!: string;

  @Column({ type: "numeric", precision: 14, scale: 6, default: 0 })
  allocatedQuantity!: number;

  @Column({ type: "numeric", precision: 14, scale: 6, default: 0 })
  overusedQuantity!: number;

  @Column({ type: "date" })
  usageDate!: string;

  @Column({ type: "varchar", length: 80, nullable: true })
  deviceId!: string | null;

  @Column({ type: "uuid", nullable: true })
  staffId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "staffId" })
  staff!: User | null;

  @Column({ type: "jsonb", nullable: true })
  meta!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}

