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

import type { ProductUnit } from "./procurement.constants";
import { Supplier } from "./supplier.entity";
import { PurchaseOrderLine } from "./purchase-order-line.entity";

@Entity({ name: "products" })
@Index("IDX_products_name_unique", ["name"], { unique: true })
@Index("IDX_products_is_active", ["isActive"])
@Index("IDX_products_category", ["category"])
export class Product {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 160 })
  name!: string;

  @Column({ type: "varchar", length: 80, default: "General" })
  category!: string;

  @Column({ type: "varchar", length: 40, nullable: true })
  sku!: string | null;

  @Column({ type: "varchar", length: 60, nullable: true })
  packSize!: string | null;

  @Column({ type: "varchar", length: 24 })
  unit!: ProductUnit;

  @Column({ type: "numeric", precision: 12, scale: 3, default: 0 })
  currentStock!: number;

  @Column({ type: "numeric", precision: 12, scale: 3, default: 0 })
  minStock!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  purchaseUnitPrice!: number;

  @Column({ type: "uuid", nullable: true })
  defaultSupplierId!: string | null;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "defaultSupplierId" })
  defaultSupplier!: Supplier | null;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @OneToMany(() => PurchaseOrderLine, (purchaseLine) => purchaseLine.product)
  purchaseLines!: PurchaseOrderLine[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
