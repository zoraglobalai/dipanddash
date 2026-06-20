import type { Request, Response } from "express";

import { app } from "../src/app";
import { initDataSource } from "../src/database/init-data-source";
import { logger } from "../src/utils/logger";

// Vercel invokes this Express application as a serverless function.
// Do not import src/server here: it calls app.listen(), which is only for
// long-running hosts such as DigitalOcean or a local Node process.
export default async function handler(req: Request, res: Response) {
  try {
    await initDataSource();
    return app(req, res);
  } catch (error) {
    logger.error("Failed to initialize the API server", error);
    return res.status(500).json({
      success: false,
      message: "Unable to initialize the API server"
    });
  }
}
