/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");
const { Client } = require("pg");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DEFAULT_FILE_NAME = "Dip&Dash & 147 snookers & PS games-17 -Apr-26(147 Snooker Lounge).csv";
const IST_OFFSET = "+05:30";
const DEFAULT_CUSTOMER_NAME = "Admin";
const DEFAULT_CUSTOMER_PHONE = "9999999999";

const MONTH_MAP = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12"
};

const RESOURCE_LABELS = {
  board_1: "Snooker Board 1",
  board_2: "Snooker Board 2",
  board_3: "Snooker Board 3",
  board_4: "Snooker Board 4",
  board_5: "Snooker Board 5",
  board_6: "Snooker Board 6",
  ps2: "PlayStation 2",
  ps4: "PlayStation 4",
  ps5: "PlayStation 5",
  xbox: "Xbox"
};

const toMoney = (value) => {
  if (value === undefined || value === null) {
    return 0;
  }
  const text = String(value).replace(/[^0-9.\-]/g, "").trim();
  if (!text) {
    return 0;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const toPhone = (value) => {
  const digits = String(value ?? "")
    .replace(/\D/g, "")
    .trim();
  if (digits.length >= 7) {
    return digits;
  }
  return DEFAULT_CUSTOMER_PHONE;
};

const toName = (value) => {
  const cleaned = String(value ?? "").trim();
  if (!cleaned || cleaned === "-") {
    return DEFAULT_CUSTOMER_NAME;
  }
  return cleaned;
};

const parseDateParts = (value) => {
  const text = String(value ?? "").trim();
  const match = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2})$/.exec(text);
  if (!match) {
    return null;
  }
  const day = match[1].padStart(2, "0");
  const month = MONTH_MAP[match[2].toLowerCase()];
  if (!month) {
    return null;
  }
  const year = `20${match[3]}`;
  return { year, month, day };
};

const parseClock = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || raw.toUpperCase() === "#VALUE!") {
    return null;
  }

  let normalized = raw
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/\./g, ":")
    .replace(/AP$/, "AM")
    .replace(/A$/, "AM")
    .replace(/P$/, "PM")
    .replace(/PPM$/, "PM")
    .replace(/AMM$/, "AM");

  if (normalized.startsWith(":")) {
    normalized = `0${normalized}`;
  }

  const match = /^(\d{1,2})(?::(\d{1,2}))?(AM|PM)?$/.exec(normalized);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridian = match[3] ?? null;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59 || hours > 12 || hours < 0) {
    return null;
  }

  if (meridian) {
    if (hours === 12) {
      hours = meridian === "AM" ? 0 : 12;
    } else if (meridian === "PM") {
      hours += 12;
    }
  }

  return { hours, minutes };
};

const parseDurationMinutes = (primaryValue, fallbackValue) => {
  const candidates = [String(primaryValue ?? "").trim(), String(fallbackValue ?? "").trim()];
  for (const value of candidates) {
    if (!value || value === "-" || value.toUpperCase() === "#VALUE!") {
      continue;
    }
    const hhmm = /^(\d{1,2}):(\d{1,2})$/.exec(value);
    if (hhmm) {
      const hours = Number(hhmm[1]);
      const minutes = Number(hhmm[2]);
      if (Number.isFinite(hours) && Number.isFinite(minutes)) {
        return Math.max(0, hours * 60 + minutes);
      }
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.round(numeric * 60);
    }
  }
  return null;
};

const buildIstDate = (dateParts, clock) => {
  const hh = String(clock.hours).padStart(2, "0");
  const mm = String(clock.minutes).padStart(2, "0");
  return new Date(`${dateParts.year}-${dateParts.month}-${dateParts.day}T${hh}:${mm}:00${IST_OFFSET}`);
};

const normalizeResource = (rawValue) => {
  const normalized = String(rawValue ?? "").trim().toLowerCase();
  if (/^[1-6]$/.test(normalized)) {
    const code = `board_${normalized}`;
    return { bookingType: "snooker", resourceCode: code, resourceLabel: RESOURCE_LABELS[code] };
  }
  if (normalized.includes("ps5")) {
    return { bookingType: "console", resourceCode: "ps5", resourceLabel: RESOURCE_LABELS.ps5 };
  }
  if (normalized.includes("ps4")) {
    return { bookingType: "console", resourceCode: "ps4", resourceLabel: RESOURCE_LABELS.ps4 };
  }
  if (normalized.includes("ps2")) {
    return { bookingType: "console", resourceCode: "ps2", resourceLabel: RESOURCE_LABELS.ps2 };
  }
  if (normalized.includes("xbox")) {
    return { bookingType: "console", resourceCode: "xbox", resourceLabel: RESOURCE_LABELS.xbox };
  }
  if (normalized === "ps" || normalized.includes("playstation")) {
    return { bookingType: "console", resourceCode: "ps4", resourceLabel: RESOURCE_LABELS.ps4 };
  }
  return { bookingType: "snooker", resourceCode: "board_1", resourceLabel: RESOURCE_LABELS.board_1 };
};

const detectMode = (text) => {
  const value = String(text ?? "").toLowerCase();
  const hasCash = value.includes("cash");
  const hasCard = value.includes("card") || value.includes("credit") || value.includes("debit");
  const hasUpi = value.includes("upi") || value.includes("gpay") || value.includes("phonepe") || value.includes("paytm");
  if (hasUpi && !hasCash && !hasCard) {
    return "upi";
  }
  if (hasCard && !hasCash && !hasUpi) {
    return "card";
  }
  if (hasCash) {
    return "cash";
  }
  if (hasUpi) {
    return "upi";
  }
  if (hasCard) {
    return "card";
  }
  return "cash";
};

const parseSplitAmounts = (text) => {
  const lower = String(text ?? "").toLowerCase();
  const readAmount = (pattern) => {
    const match = pattern.exec(lower);
    return match ? toMoney(match[1]) : 0;
  };
  const cash = readAmount(/cash\s*[-:]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const upi = readAmount(/(?:gpay|gapy|upi|phonepe|paytm)\s*[-:]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const card = readAmount(/(?:card|credit|debit)\s*[-:]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const total = Number((cash + upi + card).toFixed(2));
  return { cash, upi, card, total };
};

const parsePendingFromTail = (tailValues, totalAmount, remarksText) => {
  if (tailValues.length > 1) {
    const last = String(tailValues[tailValues.length - 1] ?? "").trim();
    const pendingCandidate = toMoney(last);
    if (pendingCandidate > 0 && pendingCandidate <= totalAmount) {
      return pendingCandidate;
    }
  }
  if (/pending/i.test(remarksText) && totalAmount > 0) {
    return totalAmount;
  }
  return 0;
};

const buildBookingNumber = (dateParts, serial) =>
  `LEGACY-GM-${dateParts.year}${dateParts.month}${dateParts.day}-${String(serial).padStart(4, "0")}`;

const resolveCsvPath = (inputArg) => {
  if (inputArg) {
    return path.isAbsolute(inputArg) ? inputArg : path.resolve(process.cwd(), "..", inputArg);
  }
  return path.resolve(process.cwd(), "..", DEFAULT_FILE_NAME);
};

const parseCsvRows = (csvPath) => {
  const raw = fs.readFileSync(csvPath, "utf8").replace(/\r/g, "");
  const lines = raw.split("\n");
  const parsed = [];
  const skipped = [];

  let headerFound = false;
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const line = lines[index];
    if (!headerFound) {
      if (line.startsWith("S.No,")) {
        headerFound = true;
      }
      continue;
    }

    if (!line.trim()) {
      continue;
    }
    const columns = line.split(",");
    const serial = Number(columns[0]?.trim());
    if (!Number.isFinite(serial)) {
      skipped.push({ lineNo, reason: "invalid_serial", raw: line });
      continue;
    }

    const dateParts = parseDateParts(columns[2]);
    if (!dateParts) {
      skipped.push({ lineNo, reason: "missing_or_invalid_date", serial });
      continue;
    }

    const customerName = toName(columns[3]);
    const customerPhone = toPhone(columns[4]);
    const resource = normalizeResource(columns[5]);

    const checkInClock = parseClock(columns[6]) ?? { hours: 12, minutes: 0 };
    let checkInAt = buildIstDate(dateParts, checkInClock);

    let checkOutAt = null;
    const outClock = parseClock(columns[7]);
    if (outClock) {
      checkOutAt = buildIstDate(dateParts, outClock);
      if (checkOutAt.getTime() <= checkInAt.getTime()) {
        checkOutAt = new Date(checkOutAt.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    const durationMinutesFromSheet = parseDurationMinutes(columns[9], columns[8]);
    if (!checkOutAt) {
      const fallbackMinutes = durationMinutesFromSheet && durationMinutesFromSheet > 0 ? durationMinutesFromSheet : 60;
      checkOutAt = new Date(checkInAt.getTime() + fallbackMinutes * 60 * 1000);
    }

    const observedMinutes = Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000);
    if (observedMinutes > 12 * 60 && durationMinutesFromSheet && durationMinutesFromSheet > 0 && durationMinutesFromSheet <= 6 * 60) {
      checkOutAt = new Date(checkInAt.getTime() + durationMinutesFromSheet * 60 * 1000);
    }

    const safeDurationMinutes = Math.max(1, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000));
    const amount = toMoney(columns[11]);
    const rate = toMoney(columns[10]);
    const hourlyRate = rate > 0 ? rate : Number(((amount || 0) / (safeDurationMinutes / 60)).toFixed(2));

    const tail = columns.slice(12).map((value) => String(value ?? "").trim());
    const remarks = tail.filter(Boolean).join(", ");
    const pendingAmountRaw = parsePendingFromTail(tail, amount, remarks);
    const split = parseSplitAmounts(remarks);

    let pendingAmount = pendingAmountRaw;
    let collectedAmount = Number((amount - pendingAmount).toFixed(2));
    if (pendingAmountRaw <= 0 && split.total > 0 && split.total <= amount) {
      collectedAmount = split.total;
      pendingAmount = Number((amount - collectedAmount).toFixed(2));
    }
    if (pendingAmount < 0) {
      pendingAmount = 0;
      collectedAmount = amount;
    }
    if (pendingAmount > amount) {
      pendingAmount = amount;
      collectedAmount = 0;
    }

    const paymentStatus = pendingAmount > 0.001 ? "pending" : "paid";
    const paymentMode = detectMode(remarks);
    const bookingNumber = buildBookingNumber(dateParts, serial);

    parsed.push({
      lineNo,
      serial,
      bookingNumber,
      bookingType: resource.bookingType,
      resourceCode: resource.resourceCode,
      resourceLabel: resource.resourceLabel,
      customerName,
      customerPhone,
      checkInAt,
      checkOutAt,
      hourlyRate: Number(hourlyRate.toFixed(2)),
      finalAmount: amount,
      systemCalculatedAmount: amount,
      paymentStatus,
      paymentMode,
      pendingAmount,
      collectedAmount,
      split,
      note: remarks || null
    });
  }

  return { parsed, skipped };
};

const choosePrimaryStaff = async (client) => {
  const users = await client.query(
    `
      SELECT id, role, username, "fullName"
      FROM users
      WHERE "isActive" = true
        AND role IN ('admin', 'snooker_staff')
      ORDER BY
        CASE WHEN role = 'snooker_staff' THEN 0 ELSE 1 END,
        "createdAt" ASC
    `
  );
  if (!users.rows.length) {
    throw new Error("No active admin or snooker_staff user found. Create user first.");
  }

  const snookerStaff = users.rows.find((row) => row.role === "snooker_staff") ?? null;
  const admin = users.rows.find((row) => row.role === "admin") ?? null;
  const selected = snookerStaff ?? admin ?? users.rows[0];

  return {
    selectedStaffId: selected.id,
    selectedStaffRole: selected.role,
    adminUserId: admin?.id ?? selected.id
  };
};

const insertRows = async (client, rows, selectedStaffId, adminUserId) => {
  let inserted = 0;
  let updated = 0;
  let pendingRowsInserted = 0;

  for (const row of rows) {
    const bookingId = crypto.randomUUID();
    const bookingResult = await client.query(
      `
        INSERT INTO gaming_bookings (
          id, "bookingNumber", "bookingType", "resourceCode", "resourceLabel", "resourceCodes",
          "customerGroup", "primaryCustomerName", "primaryCustomerPhone",
          "checkInAt", "checkOutAt", "hourlyRate", "finalAmount", "systemCalculatedAmount",
          "extraMemberCount", "extraMemberCharge", "amountOverrideReason",
          status, "paymentStatus", "paymentMode",
          "foodOrderReference", "foodInvoiceNumber", "foodInvoiceStatus", "foodAndBeverageAmount",
          "bookingChannel", "sourceDeviceId", note, "staffId",
          "createdAt", "updatedAt"
        )
        VALUES (
          $1, $2, $3, $4, $5, $6::jsonb,
          $7::jsonb, $8, $9,
          $10, $11, $12, $13, $14,
          0, 0, NULL,
          'completed', $15, $16,
          NULL, NULL, 'none', 0,
          'legacy_csv_import', 'legacy-csv', $17, $18,
          $19, $20
        )
        ON CONFLICT ("bookingNumber")
        DO UPDATE SET
          "bookingType" = EXCLUDED."bookingType",
          "resourceCode" = EXCLUDED."resourceCode",
          "resourceLabel" = EXCLUDED."resourceLabel",
          "resourceCodes" = EXCLUDED."resourceCodes",
          "customerGroup" = EXCLUDED."customerGroup",
          "primaryCustomerName" = EXCLUDED."primaryCustomerName",
          "primaryCustomerPhone" = EXCLUDED."primaryCustomerPhone",
          "checkInAt" = EXCLUDED."checkInAt",
          "checkOutAt" = EXCLUDED."checkOutAt",
          "hourlyRate" = EXCLUDED."hourlyRate",
          "finalAmount" = EXCLUDED."finalAmount",
          "systemCalculatedAmount" = EXCLUDED."systemCalculatedAmount",
          status = EXCLUDED.status,
          "paymentStatus" = EXCLUDED."paymentStatus",
          "paymentMode" = EXCLUDED."paymentMode",
          note = EXCLUDED.note,
          "staffId" = EXCLUDED."staffId",
          "updatedAt" = EXCLUDED."updatedAt"
        RETURNING id, ("xmax" = 0) AS inserted
      `,
      [
        bookingId,
        row.bookingNumber,
        row.bookingType,
        row.resourceCode,
        row.resourceLabel,
        JSON.stringify([row.resourceCode]),
        JSON.stringify([{ name: row.customerName, phone: row.customerPhone }]),
        row.customerName,
        row.customerPhone,
        row.checkInAt.toISOString(),
        row.checkOutAt.toISOString(),
        row.hourlyRate,
        row.finalAmount,
        row.systemCalculatedAmount,
        row.paymentStatus,
        row.paymentMode,
        row.note,
        selectedStaffId,
        row.checkInAt.toISOString(),
        row.checkOutAt.toISOString()
      ]
    );

    const saved = bookingResult.rows[0];
    if (saved?.inserted) {
      inserted += 1;
    } else {
      updated += 1;
    }

    const savedBookingId = saved.id;
    await client.query(
      `DELETE FROM pending_payment_histories WHERE "sourceType" = 'gaming_booking' AND "sourceId" = $1`,
      [savedBookingId]
    );

    if (row.pendingAmount > 0.001 && row.collectedAmount > 0.001) {
      let amount = row.collectedAmount;
      let mode = row.paymentMode;

      if (row.split.total > 0) {
        if (Math.abs(row.split.upi - row.collectedAmount) <= 0.01) {
          mode = "upi";
          amount = row.split.upi;
        } else if (Math.abs(row.split.cash - row.collectedAmount) <= 0.01) {
          mode = "cash";
          amount = row.split.cash;
        } else if (Math.abs(row.split.card - row.collectedAmount) <= 0.01) {
          mode = "card";
          amount = row.split.card;
        }
      }

      await client.query(
        `
          INSERT INTO pending_payment_histories (
            id, "sourceType", "sourceId", "sourceNumber", "customerName", "customerPhone",
            mode, amount, "remainingAmount", "referenceNo", note, "collectedByUserId", "createdAt"
          )
          VALUES (
            $1, 'gaming_booking', $2, $3, $4, $5,
            $6, $7, $8, NULL, $9, $10, $11
          )
        `,
        [
          crypto.randomUUID(),
          savedBookingId,
          row.bookingNumber,
          row.customerName,
          row.customerPhone,
          mode,
          Number(amount.toFixed(2)),
          Number(row.pendingAmount.toFixed(2)),
          row.note ? `Legacy CSV import: ${row.note}` : "Legacy CSV import",
          adminUserId,
          row.checkOutAt.toISOString()
        ]
      );
      pendingRowsInserted += 1;
    }
  }

  return { inserted, updated, pendingRowsInserted };
};

const countImportedRows = async (client) => {
  const [bookingCount, pendingCount] = await Promise.all([
    client.query(`SELECT COUNT(*)::int AS count FROM gaming_bookings WHERE "bookingNumber" LIKE 'LEGACY-GM-%'`),
    client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM pending_payment_histories
        WHERE "sourceType" = 'gaming_booking'
          AND "sourceNumber" LIKE 'LEGACY-GM-%'
      `
    )
  ]);
  return {
    legacyBookings: Number(bookingCount.rows[0]?.count ?? 0),
    legacyPendingHistoryRows: Number(pendingCount.rows[0]?.count ?? 0)
  };
};

async function main() {
  const csvPath = resolveCsvPath(process.argv[2]);
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing in backend/.env");
  }

  const { parsed, skipped } = parseCsvRows(csvPath);
  if (!parsed.length) {
    throw new Error("No valid booking rows found in the CSV.");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    const staff = await choosePrimaryStaff(client);
    await client.query("BEGIN");
    const writeSummary = await insertRows(client, parsed, staff.selectedStaffId, staff.adminUserId);
    await client.query("COMMIT");

    const importedCounts = await countImportedRows(client);
    console.log(
      JSON.stringify(
        {
          success: true,
          csvPath,
          parsedRows: parsed.length,
          skippedRows: skipped.length,
          writeSummary,
          importedCounts,
          assignedStaffRole: staff.selectedStaffRole,
          sampleSkipped: skipped.slice(0, 10)
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[IMPORT_FAILED]", error);
  process.exit(1);
});

