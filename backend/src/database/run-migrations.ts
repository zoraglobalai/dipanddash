import { AppDataSource } from "./data-source";
import { logger } from "../utils/logger";

const runMigrations = async (): Promise<void> => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const migrations = await AppDataSource.runMigrations();

    if (migrations.length === 0) {
      logger.info("No pending database migrations");
    } else {
      logger.info(
        `Applied ${migrations.length} migration${migrations.length > 1 ? "s" : ""}: ${migrations
          .map((migration) => migration.name)
          .join(", ")}`
      );
    }
  } catch (error) {
    logger.error("Failed to run database migrations", error);
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};

runMigrations();
