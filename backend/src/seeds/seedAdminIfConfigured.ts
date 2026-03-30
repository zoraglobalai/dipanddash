import "reflect-metadata";

import { env } from "../config/env";
import { logger } from "../utils/logger";
import { seedAdmin } from "./seedAdmin";

const runOptionalSeed = async (): Promise<void> => {
  const hasSeedConfig = Boolean(env.SEED_ADMIN_USERNAME && env.SEED_ADMIN_PASSWORD);

  if (!hasSeedConfig) {
    logger.info("Seed skipped: SEED_ADMIN_USERNAME/SEED_ADMIN_PASSWORD not configured.");
    return;
  }

  await seedAdmin();
};

runOptionalSeed();
