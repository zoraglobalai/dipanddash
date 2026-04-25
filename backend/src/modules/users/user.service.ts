import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { UserRole } from "../../constants/roles";
import { env } from "../../config/env";
import { User } from "./user.entity";
import { EntityManager, FindOptionsWhere, QueryFailedError } from "typeorm";
import { Invoice } from "../invoices/invoice.entity";
import { InvoiceUsageEvent } from "../invoices/invoice-usage-event.entity";
import { GamingBooking } from "../gaming/gaming-booking.entity";
import { PendingPaymentHistory } from "../pending/pending-payment-history.entity";
import { CashAudit } from "../cash-audit/cash-audit.entity";
import { DumpEntry } from "../dump/dump.entity";
import { OutletTransfer } from "../outlet-transfers/outlet-transfer.entity";
import { SyncReceipt } from "../pos-sync/sync-receipt.entity";

type SafeUser = Omit<User, "passwordHash">;

export class UserService {
  private readonly userRepository = AppDataSource.getRepository(User);
  private readonly seedAdminUsername = env.SEED_ADMIN_USERNAME?.trim().toLowerCase() ?? "";

  private normalizeUsername(username: string) {
    return username.trim().toLowerCase();
  }

  isSuperAdminAccount(user: Pick<User, "role" | "username">) {
    return (
      user.role === UserRole.ADMIN &&
      this.seedAdminUsername.length > 0 &&
      this.normalizeUsername(user.username) === this.seedAdminUsername
    );
  }

  private isProtectedAdminAccount(user: Pick<User, "role" | "username">) {
    return this.isSuperAdminAccount(user);
  }

  async findByUsernameForAuth(username: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("LOWER(user.username) = LOWER(:username)", { username })
      .getOne();
  }

  async findById(id: string): Promise<SafeUser> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    return user;
  }

  async findByIdWithPassword(id: string): Promise<User> {
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.id = :id", { id })
      .getOne();

    if (!user) {
      throw new AppError(404, "User not found");
    }

    return user;
  }

  async listStaff(search?: string): Promise<SafeUser[]> {
    const query = this.userRepository
      .createQueryBuilder("user")
      .orderBy("user.createdAt", "DESC");

    if (this.seedAdminUsername.length > 0) {
      query.where("LOWER(user.username) != LOWER(:seedAdminUsername)", {
        seedAdminUsername: this.seedAdminUsername
      });
    }

    if (search) {
      query.andWhere(
        "(LOWER(user.fullName) LIKE LOWER(:search) OR LOWER(user.username) LIKE LOWER(:search))",
        { search: `%${search}%` }
      );
    }

    return query.getMany();
  }

  async createStaff(payload: {
    username: string;
    fullName: string;
    passwordHash: string;
    email?: string | null;
    role: UserRole;
    isActive?: boolean;
    assignedReports?: string[];
    assignedModules?: string[];
  }): Promise<SafeUser> {
    const whereConditions: FindOptionsWhere<User>[] = [
      { username: payload.username }
    ];

    if (payload.email) {
      whereConditions.push({ email: payload.email });
    }

    const existing = await this.userRepository.findOne({
      where: whereConditions
    });

    if (existing) {
      throw new AppError(409, "A staff member with this username or email already exists");
    }

    const user = this.userRepository.create({
      username: payload.username,
      fullName: payload.fullName,
      passwordHash: payload.passwordHash,
      email: payload.email ?? null,
      role: payload.role,
      isActive: payload.isActive ?? true,
      assignedReports: payload.assignedReports ?? [],
      assignedModules: payload.assignedModules ?? []
    });

    return this.userRepository.save(user);
  }

  async updateStaff(
    id: string,
    payload: Partial<Pick<User, "fullName" | "email" | "role" | "assignedReports" | "assignedModules">>
  ): Promise<SafeUser> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "Staff member not found");
    }
    if (this.isProtectedAdminAccount(user)) {
      throw new AppError(403, "Admin account cannot be modified from staff management.");
    }

    if (payload.email && payload.email !== user.email) {
      const emailExists = await this.userRepository.findOne({ where: { email: payload.email } });
      if (emailExists) {
        throw new AppError(409, "This email is already used by another staff member");
      }
    }

    user.fullName = payload.fullName ?? user.fullName;
    user.email = payload.email === undefined ? user.email : payload.email;
    user.role = payload.role ?? user.role;
    if (payload.assignedReports !== undefined) {
      user.assignedReports = payload.assignedReports;
    }
    if (payload.assignedModules !== undefined) {
      user.assignedModules = payload.assignedModules;
    }

    return this.userRepository.save(user);
  }

  async updateStaffStatus(id: string, isActive: boolean): Promise<SafeUser> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "Staff member not found");
    }
    if (this.isProtectedAdminAccount(user)) {
      throw new AppError(403, "Admin account cannot be modified from staff management.");
    }

    user.isActive = isActive;
    return this.userRepository.save(user);
  }

  async resetStaffPassword(id: string, passwordHash: string): Promise<SafeUser> {
    const user = await this.findByIdWithPassword(id);
    if (this.isProtectedAdminAccount(user)) {
      throw new AppError(403, "Admin account cannot be modified from staff management.");
    }

    user.passwordHash = passwordHash;
    return this.userRepository.save(user);
  }

  private async deletePendingHistoryBySources(
    manager: EntityManager,
    sourceType: "invoice" | "gaming_booking",
    sourceIds: string[]
  ) {
    if (!sourceIds.length) {
      return;
    }
    await manager
      .createQueryBuilder()
      .delete()
      .from(PendingPaymentHistory)
      .where(`"sourceType" = :sourceType`, { sourceType })
      .andWhere(`"sourceId" IN (:...sourceIds)`, { sourceIds })
      .execute();
  }

  private async deleteStaffWithRelatedRecords(staffId: string) {
    await AppDataSource.transaction(async (manager) => {
      const invoiceRepository = manager.getRepository(Invoice);
      const gamingBookingRepository = manager.getRepository(GamingBooking);

      const invoiceRows = await invoiceRepository.find({
        where: { staffId },
        select: { id: true }
      });
      const invoiceIds = invoiceRows.map((row) => row.id);
      if (invoiceIds.length) {
        await this.deletePendingHistoryBySources(manager, "invoice", invoiceIds);
        await manager
          .createQueryBuilder()
          .delete()
          .from(InvoiceUsageEvent)
          .where(`"invoiceId" IN (:...invoiceIds)`, { invoiceIds })
          .execute();
        await invoiceRepository.delete({ staffId });
      }

      const gamingBookingRows = await gamingBookingRepository.find({
        where: { staffId },
        select: { id: true }
      });
      const gamingBookingIds = gamingBookingRows.map((row) => row.id);
      if (gamingBookingIds.length) {
        await this.deletePendingHistoryBySources(manager, "gaming_booking", gamingBookingIds);
        await gamingBookingRepository.delete({ staffId });
      }

      await manager
        .createQueryBuilder()
        .delete()
        .from(CashAudit)
        .where(`"createdByUserId" = :staffId OR "approvedByAdminId" = :staffId`, { staffId })
        .execute();
      await manager.getRepository(DumpEntry).delete({ createdByUserId: staffId });
      await manager.getRepository(OutletTransfer).delete({ createdByUserId: staffId });
      await manager.getRepository(SyncReceipt).delete({ staffId });

      await manager.getRepository(User).delete({ id: staffId });
    });
  }

  async deleteStaff(id: string, options?: { permanent?: boolean }): Promise<SafeUser> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "Staff member not found");
    }
    if (this.isProtectedAdminAccount(user)) {
      throw new AppError(403, "Admin account cannot be modified from staff management.");
    }

    if (options?.permanent) {
      try {
        await this.deleteStaffWithRelatedRecords(id);
        return user;
      } catch (error) {
        if (error instanceof QueryFailedError) {
          const driverError = error.driverError as { code?: string } | undefined;
          if (driverError?.code === "23503") {
            throw new AppError(
              409,
              "Permanent delete failed because additional related records exist. Please contact support."
            );
          }
        }
        throw error;
      }
    }

    try {
      await this.userRepository.remove(user);
      return user;
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const driverError = error.driverError as { code?: string } | undefined;
        if (driverError?.code === "23503") {
          throw new AppError(
            409,
            "Cannot delete this staff member because related records exist. Use permanent delete to remove staff with all related records."
          );
        }
      }
      throw error;
    }
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    const result = await this.userRepository.update({ id }, { passwordHash });
    if (!result.affected) {
      throw new AppError(404, "User not found");
    }
  }
}
