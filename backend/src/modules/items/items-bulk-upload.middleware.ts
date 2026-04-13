import path from "path";
import multer from "multer";

import { AppError } from "../../errors/app-error";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain"
]);

const fileFilter: multer.Options["fileFilter"] = (_req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const isCsv = extension === ".csv";
  const isAllowedMime = ALLOWED_MIME_TYPES.has(file.mimetype);

  if (!isCsv || !isAllowedMime) {
    callback(new AppError(422, "Please upload a valid CSV file. You can export an Excel sheet as .csv."));
    return;
  }

  callback(null, true);
};

export const itemBulkUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  }
});
