import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { UserRole } from "../../constants/roles";
import { User } from "./user.entity";
import { FindOptionsWhere } from "typeorm";

type SafeUser = Omit<User, "passwordHash">;

export class UserService {
  private readonly userRepository = AppDataSource.getRepository(User);

  async findByUsernameForAuth(username: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("LOWER(user.username) = LOWER(:username)", { username })
      .getOne();
  }

  async findById(id: string): Promise<SafeUser> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    return user;
  }

  async listStaff(search?: string): Promise<SafeUser[]> {
    const query = this.userRepository
      .createQueryBuilder("user")
      .where("user.role != :adminRole", { adminRole: UserRole.ADMIN })
      .orderBy("user.createdAt", "DESC");

    if (search) {
      query.andWhere(
        "(LOWER(user.fullName) LIKE LOWER(:search) OR LOWER(user.username) LIKE LOWER(:search))",
        { search: `%${search}%` }
      );
    }

    return query.getMany();
  }

  async createStaff(payload: {
    username: string;
    fullName: string;
    passwordHash: string;
    email?: string | null;
    role: UserRole;
    isActive?: boolean;
    assignedReports?: string[];
    assignedModules?: string[];
  }): Promise<SafeUser> {
    const whereConditions: FindOptionsWhere<User>[] = [
      { username: payload.username }
    ];

    if (payload.email) {
      whereConditions.push({ email: payload.email });
    }

    const existing = await this.userRepository.findOne({
      where: whereConditions
    });

    if (existing) {
      throw new AppError(409, "A staff member with this username or email already exists");
    }

    const user = this.userRepository.create({
      username: payload.username,
      fullName: payload.fullName,
      passwordHash: payload.passwordHash,
      email: payload.email ?? null,
      role: payload.role,
      isActive: payload.isActive ?? true,
      assignedReports: payload.assignedReports ?? [],
      assignedModules: payload.assignedModules ?? []
    });

    return this.userRepository.save(user);
  }

  async updateStaff(
    id: string,
    payload: Partial<Pick<User, "fullName" | "email" | "role" | "assignedReports" | "assignedModules">>
  ): Promise<SafeUser> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "Staff member not found");
    }
    if (user.role === UserRole.ADMIN) {
      throw new AppError(403, "Admin account cannot be modified from staff management.");
    }

    if (payload.email && payload.email !== user.email) {
      const emailExists = await this.userRepository.findOne({ where: { email: payload.email } });
      if (emailExists) {
        throw new AppError(409, "This email is already used by another staff member");
      }
    }

    user.fullName = payload.fullName ?? user.fullName;
    user.email = payload.email === undefined ? user.email : payload.email;
    user.role = payload.role ?? user.role;
    if (payload.assignedReports !== undefined) {
      user.assignedReports = payload.assignedReports;
    }
    if (payload.assignedModules !== undefined) {
      user.assignedModules = payload.assignedModules;
    }

    return this.userRepository.save(user);
  }

  async updateStaffStatus(id: string, isActive: boolean): Promise<SafeUser> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "Staff member not found");
    }
    if (user.role === UserRole.ADMIN) {
      throw new AppError(403, "Admin account cannot be modified from staff management.");
    }

    user.isActive = isActive;
    return this.userRepository.save(user);
  }

  async resetStaffPassword(id: string, passwordHash: string): Promise<SafeUser> {
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.id = :id", { id })
      .getOne();

    if (!user) {
      throw new AppError(404, "Staff member not found");
    }
    if (user.role === UserRole.ADMIN) {
      throw new AppError(403, "Admin account cannot be modified from staff management.");
    }

    user.passwordHash = passwordHash;
    return this.userRepository.save(user);
  }
}
