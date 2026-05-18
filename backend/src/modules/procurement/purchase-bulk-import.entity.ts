import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

import type { PurchaseSection } from "./procurement.constants";

@Entity({ name: "purchase_bulk_imports" })
@Index("IDX_purchase_bulk_imports_section_created", ["purchaseSection", "createdAt"])
export class PurchaseBulkImport {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 260 })
  fileName!: string;

  @Column({ type: "varchar", length: 20, default: "gaming" })
  purchaseSection!: PurchaseSection;

  @Column({ type: "uuid", nullable: true })
  createdByUserId!: string | null;

  @Column({ type: "jsonb" })
  summary!: Record<string, unknown>;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
