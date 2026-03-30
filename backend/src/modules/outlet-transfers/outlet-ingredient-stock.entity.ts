import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "outlet_ingredient_stocks" })
@Index("IDX_outlet_ingredient_stock_unique", ["outletId", "ingredientId"], { unique: true })
export class OutletIngredientStock {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  outletId!: string;

  @Column({ type: "uuid" })
  ingredientId!: string;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  totalStock!: number;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
