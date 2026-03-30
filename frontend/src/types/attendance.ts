import type { UserRole } from "./role";

export type PunchPayload = {
  username: string;
  password: string;
};

export type AttendanceRecord = {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  punchInAt: string;
  punchOutAt: string | null;
  status: "punched_in" | "punched_out";
  activeMinutes: number;
  breakMinutes: number;
  totalMinutes: number;
};

export type AttendanceSummary = {
  totalRecords: number;
  presentStaff: number;
  currentlyPunchedIn: number;
  activeHours: number;
  breakHours: number;
  totalHours: number;
};

export type AttendancePagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AttendanceListData = {
  records: AttendanceRecord[];
  summary: AttendanceSummary;
  pagination: AttendancePagination;
};
