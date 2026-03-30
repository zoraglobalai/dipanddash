import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

import { Product } from "./product.entity";
import { PurchaseOrder } from "./purchase-order.entity";

@Entity({ name: "suppliers" })
@Index("IDX_suppliers_name_unique", ["name"], { unique: true })
export class Supplier {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 140 })
  name!: string;

  @Column({ type: "varchar", length: 160, nullable: true })
  storeName!: string | null;

  @Column({ type: "varchar", length: 20 })
  phone!: string;

  @Column({ type: "text", nullable: true })
  address!: string | null;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.supplier)
  purchaseOrders!: PurchaseOrder[];

  @OneToMany(() => Product, (product) => product.defaultSupplier)
  products!: Product[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
