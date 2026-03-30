import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

import { User } from "../users/user.entity";
import { DUMP_ENTRY_TYPES, type DumpEntryType, type DumpIngredientImpact } from "./dump.constants";

@Entity({ name: "dump_entries" })
export class DumpEntry {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "date" })
  entryDate!: string;

  @Column({ type: "enum", enum: DUMP_ENTRY_TYPES })
  entryType!: DumpEntryType;

  @Column({ type: "uuid", nullable: true })
  ingredientId!: string | null;

  @Column({ type: "uuid", nullable: true })
  itemId!: string | null;

  @Column({ type: "uuid", nullable: true })
  productId!: string | null;

  @Column({ type: "varchar", length: 180 })
  sourceName!: string;

  @Column({ type: "numeric", precision: 14, scale: 3 })
  quantity!: number;

  @Column({ type: "varchar", length: 24 })
  unit!: string;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  baseQuantity!: number;

  @Column({ type: "varchar", length: 24, nullable: true })
  baseUnit!: string | null;

  @Column({ type: "numeric", precision: 14, scale: 2, default: 0 })
  lossAmount!: number;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  ingredientImpacts!: DumpIngredientImpact[];

  @Column({ type: "varchar", length: 500, nullable: true })
  note!: string | null;

  @Column({ type: "uuid" })
  createdByUserId!: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "createdByUserId" })
  createdByUser!: User;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
