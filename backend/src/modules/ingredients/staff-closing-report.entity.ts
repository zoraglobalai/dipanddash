import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

import { User } from "../users/user.entity";

type ClosingReportItem = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  allocatedQuantity: number;
  usedQuantity: number;
  expectedRemainingQuantity: number;
  reportedRemainingQuantity: number;
  varianceQuantity: number;
};

@Index("IDX_staff_closing_reports_staff_reportDate_unique", ["staffId", "reportDate"], { unique: true })
@Entity({ name: "staff_closing_reports" })
export class StaffClosingReport {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  staffId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "staffId" })
  staff!: User;

  @Column({ type: "date" })
  reportDate!: string;

  @Column({ type: "int", default: 1 })
  closingSlot!: number;

  @Column({ type: "boolean", default: false })
  isCarryForwardClosing!: boolean;

  @Column({ type: "int", default: 0 })
  totalIngredients!: number;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  totalExpectedRemaining!: number;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  totalReportedRemaining!: number;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  totalVariance!: number;

  @Column({ type: "jsonb", nullable: false, default: () => "'[]'::jsonb" })
  items!: ClosingReportItem[];

  @Column({ type: "varchar", length: 600, nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  submittedAt!: Date;
}

