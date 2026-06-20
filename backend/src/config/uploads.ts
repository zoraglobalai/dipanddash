import os from "os";
import path from "path";

// Serverless providers mount the deployed application as read-only. Their
// temporary directory is the only writable local location.
export const uploadsRootDirectory = process.env.VERCEL
  ? path.join(os.tmpdir(), "dip-and-dash-uploads")
  : path.resolve(process.cwd(), "uploads");
