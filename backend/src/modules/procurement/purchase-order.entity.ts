import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

import { User } from "../users/user.entity";
import type { PurchaseOrderType } from "./procurement.constants";
import { Supplier } from "./supplier.entity";
import { PurchaseOrderLine } from "./purchase-order-line.entity";

@Entity({ name: "purchase_orders" })
@Index("IDX_purchase_orders_number_unique", ["purchaseNumber"], { unique: true })
@Index("IDX_purchase_orders_date", ["purchaseDate"])
export class PurchaseOrder {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64 })
  purchaseNumber!: string;

  @Column({ type: "uuid" })
  supplierId!: string;

  @ManyToOne(() => Supplier, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplierId" })
  supplier!: Supplier;

  @Column({ type: "date" })
  purchaseDate!: string;

  @Column({ type: "varchar", length: 20 })
  purchaseType!: PurchaseOrderType;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  totalAmount!: number;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @Column({ type: "text", nullable: true })
  invoiceImageUrl!: string | null;

  @Column({ type: "uuid", nullable: true })
  createdByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "createdByUserId" })
  createdByUser!: User | null;

  @OneToMany(() => PurchaseOrderLine, (line) => line.purchaseOrder, { cascade: false })
  lines!: PurchaseOrderLine[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
