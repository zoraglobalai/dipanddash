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

import { Item } from "./item.entity";
import { Combo } from "./combo.entity";

@Index("IDX_combo_item_unique", ["comboId", "itemId"], { unique: true })
@Entity({ name: "combo_items" })
export class ComboItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  comboId!: string;

  @ManyToOne(() => Combo, { onDelete: "CASCADE" })
  @JoinColumn({ name: "comboId" })
  combo!: Combo;

  @Column({ type: "uuid" })
  itemId!: string;

  @ManyToOne(() => Item, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "itemId" })
  item!: Item;

  @Column({ type: "numeric", precision: 10, scale: 3, default: 1 })
  quantity!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

