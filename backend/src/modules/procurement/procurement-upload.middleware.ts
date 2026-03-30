import fs from "fs";
import path from "path";
import multer from "multer";

import { AppError } from "../../errors/app-error";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

const sanitizeFileName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const uploadsDirectory = path.resolve(process.cwd(), "uploads", "purchase-invoices");
fs.mkdirSync(uploadsDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadsDirectory);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const normalizedExtension = extension && extension.length <= 8 ? extension : ".png";
    const rawName = path.basename(file.originalname, extension);
    const safeName = sanitizeFileName(rawName) || "invoice";
    const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    callback(null, `${uniquePrefix}-${safeName}${normalizedExtension}`);
  }
});

const fileFilter: multer.Options["fileFilter"] = (_req, file, callback) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    callback(new AppError(422, "Please upload a valid invoice image (PNG, JPG, JPEG, or WEBP)."));
    return;
  }

  callback(null, true);
};

export const purchaseInvoiceImageUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  }
});

