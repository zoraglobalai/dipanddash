import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const TABLES_TO_CLEAR = [
  "sync_queue",
  "pending_bills",
  "orders_local",
  "gaming_bookings_local",
  "customers_local",
  "catalog_snapshot",
  "app_settings"
];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const dbPathArgIndex = args.findIndex((arg) => arg === "--db");
  const dbPath =
    dbPathArgIndex >= 0 && args[dbPathArgIndex + 1]
      ? path.resolve(args[dbPathArgIndex + 1])
      : null;

  return {
    dbPath
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
  const { dbPath } = parseArgs();
  const targetDbPath = dbPath ?? resolveDefaultDbPath();

  if (!fs.existsSync(targetDbPath)) {
    console.log(`[reset-local-db] DB not found: ${targetDbPath}`);
    console.log("[reset-local-db] Nothing to clear.");
    return;
  }

  const db = new DatabaseSync(targetDbPath);

  try {
    const tableRows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all();

    const existingTables = new Set(
      tableRows
        .map((row) => (row && typeof row.name === "string" ? row.name : ""))
        .filter(Boolean)
    );

    const clearTargets = TABLES_TO_CLEAR.filter((tableName) =>
      existingTables.has(tableName)
    );

    if (!clearTargets.length) {
      console.log("[reset-local-db] No known POS tables found to clear.");
      return;
    }

    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE TRANSACTION");

    for (const tableName of clearTargets) {
      db.exec(`DELETE FROM ${tableName}`);
    }

    if (existingTables.has("sqlite_sequence")) {
      db.exec("DELETE FROM sqlite_sequence");
    }

    db.exec("COMMIT");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("VACUUM");

    console.log("[reset-local-db] Local POS data cleared successfully.");
    console.log(`[reset-local-db] DB kept: ${targetDbPath}`);
    console.log(
      `[reset-local-db] Tables cleared: ${clearTargets.join(", ")}`
    );
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // no-op
    }

    const message =
      error instanceof Error ? error.message : "Unknown SQLite error";
    console.error("[reset-local-db] Failed to clear local data:", message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
};

main();
