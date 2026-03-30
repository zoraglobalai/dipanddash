import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "./common/api-response";
import { env } from "./config/env";
import { errorMiddleware } from "./middlewares/error.middleware";
import { notFoundMiddleware } from "./middlewares/not-found.middleware";
import { apiRoutes } from "./routes";

export const app = express();
const allowedOrigins = new Set(env.CLIENT_ORIGINS);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  })
);
app.use(helmet());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.get("/health", (_req, res) => {
  return sendSuccess(res, StatusCodes.OK, "Dip & Dash API is running", {
    uptime: process.uptime()
  });
});

app.use(env.API_PREFIX, apiRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);
