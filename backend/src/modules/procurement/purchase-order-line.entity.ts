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
import type { PurchaseLineType } from "./procurement.constants";
import { Product } from "./product.entity";
import { PurchaseOrder } from "./purchase-order.entity";

@Entity({ name: "purchase_order_lines" })
@Index("IDX_purchase_order_lines_order", ["purchaseOrderId"])
@Index("IDX_purchase_order_lines_type", ["lineType"])
export class PurchaseOrderLine {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  purchaseOrderId!: string;

  @ManyToOne(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.lines, { onDelete: "CASCADE" })
  @JoinColumn({ name: "purchaseOrderId" })
  purchaseOrder!: PurchaseOrder;

  @Column({ type: "varchar", length: 20 })
  lineType!: PurchaseLineType;

  @Column({ type: "uuid", nullable: true })
  ingredientId!: string | null;

  @ManyToOne(() => Ingredient, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "ingredientId" })
  ingredient!: Ingredient | null;

  @Column({ type: "uuid", nullable: true })
  productId!: string | null;

  @ManyToOne(() => Product, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "productId" })
  product!: Product | null;

  @Column({ type: "varchar", length: 180 })
  itemNameSnapshot!: string;

  @Column({ type: "varchar", length: 140, nullable: true })
  categoryNameSnapshot!: string | null;

  @Column({ type: "varchar", length: 30 })
  unit!: string;

  @Column({ type: "numeric", precision: 12, scale: 3, default: 0 })
  stockBefore!: number;

  @Column({ type: "numeric", precision: 12, scale: 3 })
  stockAdded!: number;

  @Column({ type: "numeric", precision: 12, scale: 3, nullable: true })
  enteredQuantity!: number | null;

  @Column({ type: "varchar", length: 30, nullable: true })
  enteredUnit!: string | null;

  @Column({ type: "numeric", precision: 12, scale: 3, default: 0 })
  stockAfter!: number;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  unitPrice!: number;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  lineTotal!: number;

  @Column({ type: "boolean", default: false })
  unitPriceUpdated!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
