import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn
} from "typeorm";

import { Product } from "./product.entity";

@Entity({ name: "product_day_ledger_adjustments" })
@Unique("UQ_product_day_ledger_adjustments_product_date", ["productId", "date"])
@Index("IDX_product_day_ledger_adjustments_date", ["date"])
@Index("IDX_product_day_ledger_adjustments_product", ["productId"])
export class ProductDayLedgerAdjustment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  productId!: string;

  @ManyToOne(() => Product, { onDelete: "CASCADE" })
  @JoinColumn({ name: "productId" })
  product!: Product;

  @Column({ type: "date" })
  date!: string;

  @Column({ type: "numeric", precision: 12, scale: 3, default: 0 })
  openingDelta!: number;

  @Column({ type: "numeric", precision: 12, scale: 3, default: 0 })
  purchasedDelta!: number;

  @Column({ type: "numeric", precision: 12, scale: 3, default: 0 })
  consumptionDelta!: number;

  @Column({ type: "numeric", precision: 12, scale: 3, default: 0 })
  dipAndDashConsumptionDelta!: number;

  @Column({ type: "numeric", precision: 12, scale: 3, default: 0 })
  snookerConsumptionDelta!: number;

  @Column({ type: "varchar", length: 255, nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
