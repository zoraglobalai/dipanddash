import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "outlet_product_stocks" })
@Index("IDX_outlet_product_stock_unique", ["outletId", "productId"], { unique: true })
export class OutletProductStock {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  outletId!: string;

  @Column({ type: "uuid" })
  productId!: string;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  totalStock!: number;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
