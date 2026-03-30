import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { sendSuccess } from "../../common/api-response";
import { AppError } from "../../errors/app-error";
import { AUTH_MESSAGES } from "../../constants/auth";
import { AttendanceService } from "./attendance.service";

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const getDayKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export class AttendanceController {
  private readonly attendanceService = new AttendanceService();

  punchIn = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const record = await this.attendanceService.punchIn(userId, req.body);
    return sendSuccess(res, StatusCodes.OK, "Punch in recorded successfully", { record });
  };

  punchOut = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const record = await this.attendanceService.punchOut(userId, req.body);
    const isPreviousShift = getDayKey(new Date(record.punchInAt)) !== getDayKey(new Date());

    return sendSuccess(
      res,
      StatusCodes.OK,
      isPreviousShift
        ? "Previous open shift has been closed successfully. You can punch in for today now."
        : "Punch out recorded successfully",
      { record }
    );
  };

  getMyRecords = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, AUTH_MESSAGES.UNAUTHORIZED);
    }

    const data = await this.attendanceService.getMyRecords(userId, {
      date: typeof req.query.date === "string" ? req.query.date : undefined,
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 5)
    });

    return sendSuccess(res, StatusCodes.OK, "Attendance records fetched successfully", data);
  };

  getAdminRecords = async (req: Request, res: Response): Promise<Response> => {
    const data = await this.attendanceService.getAdminRecords({
      name: typeof req.query.name === "string" ? req.query.name : undefined,
      date: typeof req.query.date === "string" ? req.query.date : undefined,
      page: parsePositiveInt(req.query.page, 1),
      limit: parsePositiveInt(req.query.limit, 5)
    });

    return sendSuccess(res, StatusCodes.OK, "Attendance records fetched successfully", data);
  };
}
