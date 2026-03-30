export type AttendanceRecord = {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  role: string;
  punchInAt: string;
  punchOutAt: string | null;
  activeMinutes: number;
  breakMinutes: number;
  totalMinutes: number;
  status: "punched_in" | "punched_out";
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

