import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const dbPathArgIndex = args.findIndex((arg) => arg === "--db");
  const dbPath =
    dbPathArgIndex >= 0 && args[dbPathArgIndex + 1]
      ? path.resolve(args[dbPathArgIndex + 1])
      : null;

  const invoiceNumber = args.find((arg, index) => {
    if (arg.startsWith("--")) {
      return false;
    }
    if (dbPathArgIndex >= 0 && (index === dbPathArgIndex || index === dbPathArgIndex + 1)) {
      return false;
    }
    return true;
  });

  return {
    dbPath,
    invoiceNumber: invoiceNumber?.trim() || ""
  };
};

const resolveDefaultDbPath = () => {
  const tauriConfigPath = path.resolve("src-tauri", "tauri.conf.json");
  let identifier = "com.dipanddash.pos";

  if (fs.existsSync(tauriConfigPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
      if (typeof parsed.identifier === "string" && parsed.identifier.trim()) {
        identifier = parsed.identifier.trim();
      }
    } catch {
      // fallback to default identifier
    }
  }

  const appDataDir =
    process.env.APPDATA ||
    path.join(os.homedir(), "AppData", "Roaming");

  return path.join(appDataDir, identifier, "pos.db");
};

const main = () => {
  const { dbPath, invoiceNumber } = parseArgs();

  if (!invoiceNumber) {
    console.error("[delete-local-invoice] Usage: node scripts/delete-local-invoice.mjs <invoiceNumber> [--db <path>]");
    process.exitCode = 1;
    return;
  }

  const targetDbPath = dbPath ?? resolveDefaultDbPath();
  if (!fs.existsSync(targetDbPath)) {
    console.log(`[delete-local-invoice] DB not found: ${targetDbPath}`);
    console.log("[delete-local-invoice] Nothing to delete.");
    return;
  }

  const db = new DatabaseSync(targetDbPath);
  try {
    db.exec("BEGIN IMMEDIATE TRANSACTION");

    const localOrderRows = db
      .prepare("SELECT local_order_id FROM orders_local WHERE invoice_number = ?")
      .all(invoiceNumber);
    const localOrderIds = localOrderRows
      .map((row) => (row && typeof row.local_order_id === "string" ? row.local_order_id : ""))
      .filter(Boolean);

    const deleteOrdersStmt = db.prepare("DELETE FROM orders_local WHERE invoice_number = ?");
    const deletePendingByInvoiceStmt = db.prepare("DELETE FROM pending_bills WHERE invoice_number = ?");
    const deletePendingByLocalOrderStmt = db.prepare("DELETE FROM pending_bills WHERE local_order_id = ?");
    const deleteQueueStmt = db.prepare(
      "DELETE FROM sync_queue WHERE event_type = 'invoice_upsert' AND payload_json LIKE ?"
    );

    const orderResult = deleteOrdersStmt.run(invoiceNumber);
    const pendingByInvoiceResult = deletePendingByInvoiceStmt.run(invoiceNumber);

    let pendingByLocalOrderDeleted = 0;
    for (const localOrderId of localOrderIds) {
      const result = deletePendingByLocalOrderStmt.run(localOrderId);
      pendingByLocalOrderDeleted += Number(result.changes ?? 0);
    }

    const queuePattern = `%\\\"invoiceNumber\\\":\\\"${invoiceNumber}\\\"%`;
    const queueResult = deleteQueueStmt.run(queuePattern);

    db.exec("COMMIT");
    db.exec("VACUUM");

    console.log(`[delete-local-invoice] DB: ${targetDbPath}`);
    console.log(`[delete-local-invoice] Invoice: ${invoiceNumber}`);
    console.log(`[delete-local-invoice] orders_local deleted: ${Number(orderResult.changes ?? 0)}`);
    console.log(
      `[delete-local-invoice] pending_bills deleted: ${Number(pendingByInvoiceResult.changes ?? 0) + pendingByLocalOrderDeleted}`
    );
    console.log(`[delete-local-invoice] sync_queue deleted: ${Number(queueResult.changes ?? 0)}`);
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // no-op
    }
    const message = error instanceof Error ? error.message : "Unknown SQLite error";
    console.error("[delete-local-invoice] Failed:", message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
};

main();
