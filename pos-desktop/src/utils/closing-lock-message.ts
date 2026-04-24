import type { ClosingStatus } from "@/types/pos";

const isoDatePattern = /(\d{4}-\d{2}-\d{2})/;
const isoDateTimePattern = /(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g;
const orphanTimePrefixPattern = /^T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\s*/i;

const toDisplayDate = (value: string) => {
  const matchedDate = value.match(isoDatePattern)?.[1] ?? value;
  const [yearRaw, monthRaw, dayRaw] = matchedDate.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return value;
  }

  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const normalizeReason = (reason: string) =>
  reason
    .replace(isoDateTimePattern, "$1")
    .replace(orphanTimePrefixPattern, "")
    .replace(/\s*\([^)]*GMT[+-]\d{4}[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

export const formatPendingCloseDate = (pendingCloseDate: string | null | undefined) =>
  pendingCloseDate ? toDisplayDate(pendingCloseDate) : null;

export const getClosingLockMessage = (
  closingStatus: Pick<ClosingStatus, "canTakeOrders" | "reason" | "pendingCloseDate"> | null | undefined
) => {
  if (!closingStatus || closingStatus.canTakeOrders) {
    return null;
  }

  const pendingDateLabel = formatPendingCloseDate(closingStatus.pendingCloseDate);
  if (pendingDateLabel) {
    return `Billing is paused because closing for ${pendingDateLabel} is pending. Open Closing menu and submit it to continue billing.`;
  }

  const cleanedReason = closingStatus.reason ? normalizeReason(closingStatus.reason) : "";
  if (cleanedReason) {
    return cleanedReason.endsWith(".") ? cleanedReason : `${cleanedReason}.`;
  }

  return "Billing is paused until pending closing is completed.";
};
