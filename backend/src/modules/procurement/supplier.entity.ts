import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

import { Product } from "./product.entity";
import { PurchaseOrder } from "./purchase-order.entity";
import type { PurchaseSection } from "./procurement.constants";

@Entity({ name: "suppliers" })
@Index("IDX_suppliers_name_section_unique", ["name", "section"], { unique: true })
@Index("IDX_suppliers_section", ["section"])
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

  @Column({ type: "varchar", length: 20, default: "dip_and_dash" })
  section!: PurchaseSection;

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
