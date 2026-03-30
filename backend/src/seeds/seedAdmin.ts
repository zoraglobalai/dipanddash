import "reflect-metadata";

import { AppDataSource } from "../database/data-source";
import { UserRole } from "../constants/roles";
import { User } from "../modules/users/user.entity";
import { hashPassword } from "../utils/password";
import { logger } from "../utils/logger";
import { env } from "../config/env";

const seedAdmin = async () => {
  try {
    if (!env.SEED_ADMIN_USERNAME || !env.SEED_ADMIN_PASSWORD) {
      throw new Error("SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD must be set in .env");
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userRepository = AppDataSource.getRepository(User);

    const existingAdmin = await userRepository.findOne({
      where: { username: env.SEED_ADMIN_USERNAME }
    });

    if (existingAdmin) {
      logger.info("Seed skipped: admin user already exists.");
      return;
    }

    const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);

    const adminUser = userRepository.create({
      username: env.SEED_ADMIN_USERNAME,
      fullName: env.SEED_ADMIN_FULL_NAME,
      email: null,
      role: UserRole.ADMIN,
      passwordHash,
      isActive: true
    });

    await userRepository.save(adminUser);

    logger.info(`Initial admin seeded successfully: username=${env.SEED_ADMIN_USERNAME}`);
  } catch (error) {
    logger.error("Failed to seed admin user", error);
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};

seedAdmin();
