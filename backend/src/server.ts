import { app } from "./app";
import { env } from "./config/env";
import { initDataSource } from "./database/init-data-source";
import { logger } from "./utils/logger";

const bootstrap = async (): Promise<void> => {
  try {
    await initDataSource();
    app.listen(env.PORT, () => {
      logger.info(`Dip & Dash API running on port ${env.PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }
};

bootstrap();

