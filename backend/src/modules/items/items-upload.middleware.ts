import fs from "fs";
import path from "path";
import multer from "multer";

import { AppError } from "../../errors/app-error";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml"
]);

const sanitizeFileName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const uploadsDirectory = path.resolve(process.cwd(), "uploads", "items");
fs.mkdirSync(uploadsDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadsDirectory);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const normalizedExtension = extension && extension.length <= 8 ? extension : ".png";
    const rawName = path.basename(file.originalname, extension);
    const safeName = sanitizeFileName(rawName) || "image";
    const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    callback(null, `${uniquePrefix}-${safeName}${normalizedExtension}`);
  }
});

const fileFilter: multer.Options["fileFilter"] = (_req, file, callback) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    callback(new AppError(422, "Please upload a valid image file (PNG, JPG, JPEG, WEBP or SVG)."));
    return;
  }

  callback(null, true);
};

export const itemImageUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  }
});
