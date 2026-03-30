import { IsNull } from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { UserRole } from "../../constants/roles";
import { AppError } from "../../errors/app-error";
import { AUTH_MESSAGES } from "../../constants/auth";
import { comparePassword } from "../../utils/password";
import { UserService } from "../users/user.service";
import { AttendanceRecord } from "./attendance.entity";

type PunchPayload = {
  username: string;
  password: string;
};

type AttendanceListFilters = {
  date?: string;
  name?: string;
  page: number;
  limit: number;
};

type AttendanceRecordView = {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  punchInAt: Date;
  punchOutAt: Date | null;
  status: "punched_in" | "punched_out";
  activeMinutes: number;
  breakMinutes: number;
  totalMinutes: number;
};

type AttendanceSummary = {
  totalRecords: number;
  presentStaff: number;
  currentlyPunchedIn: number;
  activeHours: number;
  breakHours: number;
  totalHours: number;
};

type AttendanceListResponse = {
  records: AttendanceRecordView[];
  summary: AttendanceSummary;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const getDayRange = (date: string) => {
  const start = new Date(`${date}T00:00:00.000`);
  if (Number.isNaN(start.getTime())) {
    throw new AppError(422, "Date must be in YYYY-MM-DD format.");
  }
  const end = new Date(`${date}T23:59:59.999`);
  return { start, end };
};

const getMinutesBetween = (start: Date, end: Date) =>
  Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));

const getDayKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const minutesToHours = (minutes: number) => Number((minutes / 60).toFixed(2));

const formatAttendanceDateTime = (value: Date) =>
  value.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });

export class AttendanceService {
  private readonly attendanceRepository = AppDataSource.getRepository(AttendanceRecord);
  private readonly userService = new UserService();

  private async verifyPunchCredentials(userId: string, payload: PunchPayload) {
    const user = await this.userService.findByUsernameForAuth(payload.username);

    if (!user || !user.passwordHash) {
      throw new AppError(401, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    if (user.id !== userId) {
      throw new AppError(403, "Use your own username and password for attendance actions.");
    }

    const isValid = await comparePassword(payload.password, user.passwordHash);
    if (!isValid) {
      throw new AppError(401, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    if (!user.isActive) {
      throw new AppError(403, "Your account is inactive. Please contact an administrator.");
    }

    return user;
  }

  private async getOpenSession(userId: string) {
    return this.attendanceRepository.findOne({
      where: { userId, punchOutAt: IsNull() },
      order: { punchInAt: "DESC" },
      relations: { user: true }
    });
  }

  private async buildRecordView(record: AttendanceRecord): Promise<AttendanceRecordView> {
    const currentEnd = record.punchOutAt ?? new Date();
    const activeMinutes = getMinutesBetween(record.punchInAt, currentEnd);

    const sameDayStart = new Date(record.punchInAt);
    sameDayStart.setHours(0, 0, 0, 0);
    const sameDayEnd = new Date(record.punchInAt);
    sameDayEnd.setHours(23, 59, 59, 999);

    const previousClosed = await this.attendanceRepository
      .createQueryBuilder("attendance")
      .where("attendance.userId = :userId", { userId: record.userId })
      .andWhere("attendance.punchInAt < :currentPunchIn", { currentPunchIn: record.punchInAt })
      .andWhere("attendance.punchInAt BETWEEN :start AND :end", { start: sameDayStart, end: sameDayEnd })
      .andWhere("attendance.punchOutAt IS NOT NULL")
      .orderBy("attendance.punchInAt", "DESC")
      .getOne();

    const breakMinutes =
      previousClosed?.punchOutAt && previousClosed.punchOutAt < record.punchInAt
        ? getMinutesBetween(previousClosed.punchOutAt, record.punchInAt)
        : 0;

    return {
      id: record.id,
      userId: record.userId,
      username: record.user.username,
      fullName: record.user.fullName,
      role: record.user.role,
      punchInAt: record.punchInAt,
      punchOutAt: record.punchOutAt,
      status: record.punchOutAt ? "punched_out" : "punched_in",
      activeMinutes,
      breakMinutes,
      totalMinutes: activeMinutes + breakMinutes
    };
  }

  private buildSummary(records: AttendanceRecord[]): AttendanceSummary {
    if (!records.length) {
      return {
        totalRecords: 0,
        presentStaff: 0,
        currentlyPunchedIn: 0,
        activeHours: 0,
        breakHours: 0,
        totalHours: 0
      };
    }

    const sorted = [...records].sort((a, b) => a.punchInAt.getTime() - b.punchInAt.getTime());
    const lastPunchOutByDay = new Map<string, Date>();
    const presentUsers = new Set<string>();
    const currentlyPunchedIn = new Set<string>();

    let activeMinutes = 0;
    let breakMinutes = 0;

    sorted.forEach((record) => {
      presentUsers.add(record.userId);

      if (!record.punchOutAt) {
        currentlyPunchedIn.add(record.userId);
      }

      const activeEnd = record.punchOutAt ?? new Date();
      activeMinutes += getMinutesBetween(record.punchInAt, activeEnd);

      const key = `${record.userId}:${getDayKey(record.punchInAt)}`;
      const previousOut = lastPunchOutByDay.get(key);
      if (previousOut && previousOut < record.punchInAt) {
        breakMinutes += getMinutesBetween(previousOut, record.punchInAt);
      }

      if (record.punchOutAt) {
        lastPunchOutByDay.set(key, record.punchOutAt);
      }
    });

    const totalMinutes = activeMinutes + breakMinutes;

    return {
      totalRecords: records.length,
      presentStaff: presentUsers.size,
      currentlyPunchedIn: currentlyPunchedIn.size,
      activeHours: minutesToHours(activeMinutes),
      breakHours: minutesToHours(breakMinutes),
      totalHours: minutesToHours(totalMinutes)
    };
  }

  async punchIn(userId: string, payload: PunchPayload) {
    await this.verifyPunchCredentials(userId, payload);

    const openSession = await this.getOpenSession(userId);
    if (openSession) {
      const now = new Date();
      const openedAt = formatAttendanceDateTime(openSession.punchInAt);
      const isPreviousDayOpenSession = getDayKey(openSession.punchInAt) !== getDayKey(now);

      if (isPreviousDayOpenSession) {
        throw new AppError(
          409,
          `Your previous shift from ${openedAt} is still open. Please punch out that shift first, then punch in for today.`
        );
      }

      throw new AppError(409, "You are already punched in for this shift. Please punch out first.");
    }

    const record = this.attendanceRepository.create({
      userId,
      punchInAt: new Date(),
      punchOutAt: null
    });

    const saved = await this.attendanceRepository.save(record);
    const withUser = await this.attendanceRepository.findOne({
      where: { id: saved.id },
      relations: { user: true }
    });

    if (!withUser) {
      throw new AppError(500, "Unable to fetch attendance record after punch in.");
    }

    return this.buildRecordView(withUser);
  }

  async punchOut(userId: string, payload: PunchPayload) {
    await this.verifyPunchCredentials(userId, payload);

    const openSession = await this.getOpenSession(userId);
    if (!openSession) {
      throw new AppError(409, "No active punch in found. Please punch in first.");
    }

    openSession.punchOutAt = new Date();
    const saved = await this.attendanceRepository.save(openSession);
    const withUser = await this.attendanceRepository.findOne({
      where: { id: saved.id },
      relations: { user: true }
    });

    if (!withUser) {
      throw new AppError(500, "Unable to fetch attendance record after punch out.");
    }

    return this.buildRecordView(withUser);
  }

  async getMyRecords(userId: string, filters: AttendanceListFilters): Promise<AttendanceListResponse> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 5));
    const offset = (page - 1) * limit;

    const query = this.attendanceRepository
      .createQueryBuilder("attendance")
      .leftJoinAndSelect("attendance.user", "user")
      .where("attendance.userId = :userId", { userId });

    if (filters.date) {
      const { start, end } = getDayRange(filters.date);
      query.andWhere("attendance.punchInAt BETWEEN :start AND :end", { start, end });
    }

    const total = await query.getCount();
    const pagedRecords = await query
      .clone()
      .orderBy("attendance.punchInAt", "DESC")
      .offset(offset)
      .limit(limit)
      .getMany();

    const allMatchingRecords = await query.clone().orderBy("attendance.punchInAt", "ASC").getMany();

    const records = await Promise.all(pagedRecords.map((record) => this.buildRecordView(record)));

    return {
      records,
      summary: this.buildSummary(allMatchingRecords),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  async getAdminRecords(filters: AttendanceListFilters): Promise<AttendanceListResponse> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 5));
    const offset = (page - 1) * limit;

    const query = this.attendanceRepository
      .createQueryBuilder("attendance")
      .leftJoinAndSelect("attendance.user", "user")
      .where("user.role != :adminRole", { adminRole: UserRole.ADMIN });

    if (filters.name) {
      query.andWhere("(LOWER(user.fullName) LIKE LOWER(:name) OR LOWER(user.username) LIKE LOWER(:name))", {
        name: `%${filters.name}%`
      });
    }

    if (filters.date) {
      const { start, end } = getDayRange(filters.date);
      query.andWhere("attendance.punchInAt BETWEEN :start AND :end", { start, end });
    }

    const total = await query.getCount();
    const pagedRecords = await query
      .clone()
      .orderBy("attendance.punchInAt", "DESC")
      .offset(offset)
      .limit(limit)
      .getMany();

    const allMatchingRecords = await query.clone().orderBy("attendance.punchInAt", "ASC").getMany();

    const records = await Promise.all(pagedRecords.map((record) => this.buildRecordView(record)));

    return {
      records,
      summary: this.buildSummary(allMatchingRecords),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }
}
