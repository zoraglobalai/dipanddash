import "reflect-metadata";

import { In } from "typeorm";

import { UserRole } from "../constants/roles";
import { AppDataSource } from "../database/data-source";
import { Invoice } from "../modules/invoices/invoice.entity";
import { InvoicesService } from "../modules/invoices/invoices.service";
import { User } from "../modules/users/user.entity";
import { logger } from "../utils/logger";

const ADMIN_LIKE_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT];

const selectActor = (users: User[]) =>
  users.find((entry) => entry.role === UserRole.ADMIN) ??
  users.find((entry) => entry.role === UserRole.MANAGER) ??
  users.find((entry) => entry.role === UserRole.ACCOUNTANT) ??
  null;

const run = async () => {
  const rawInvoiceNumber = process.argv[2];
  const invoiceNumber = rawInvoiceNumber?.trim();
  if (!invoiceNumber) {
    throw new Error("Usage: ts-node src/scripts/deleteInvoiceByNumber.ts <invoiceNumber>");
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const userRepository = AppDataSource.getRepository(User);
  const invoicesService = new InvoicesService();

  const invoice = await invoiceRepository.findOne({
    where: { invoiceNumber }
  });
  if (!invoice) {
    logger.info(`Invoice not found: ${invoiceNumber}`);
    return;
  }

  const actors = await userRepository.find({
    where: {
      role: In(ADMIN_LIKE_ROLES),
      isActive: true
    },
    order: {
      createdAt: "ASC"
    }
  });

  const actor = selectActor(actors);
  if (!actor) {
    throw new Error("No active admin/manager/accountant user found to authorize invoice deletion.");
  }

  const result = await invoicesService.deleteInvoice(invoice.id, {
    id: actor.id,
    role: actor.role
  });

  logger.info(`Invoice deleted successfully: ${result.invoiceNumber} (${result.id})`);
  logger.info(`Deleted using context user: ${actor.username} (${actor.role})`);
};

if (require.main === module) {
  run()
    .catch((error) => {
      logger.error("Failed to delete invoice by number", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
    });
}
