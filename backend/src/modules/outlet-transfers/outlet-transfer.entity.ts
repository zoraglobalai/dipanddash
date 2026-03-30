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
import type { OutletTransferLineSnapshot } from "./outlet-transfer.constants";

@Entity({ name: "outlet_transfers" })
export class OutletTransfer {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 32, unique: true })
  transferNumber!: string;

  @Column({ type: "date" })
  transferDate!: string;

  @Column({ type: "uuid" })
  fromOutletId!: string;

  @Column({ type: "varchar", length: 180 })
  fromOutletName!: string;

  @Column({ type: "uuid" })
  toOutletId!: string;

  @Column({ type: "varchar", length: 180 })
  toOutletName!: string;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  lines!: OutletTransferLineSnapshot[];

  @Column({ type: "integer", default: 0 })
  lineCount!: number;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  totalQuantity!: number;

  @Column({ type: "numeric", precision: 14, scale: 2, default: 0 })
  totalValue!: number;

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
