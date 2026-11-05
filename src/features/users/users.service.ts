// users service — use-case layer; validation → unique check → transaction insert
import { Inject, Injectable } from "@nestjs/common";
import { ZodError } from "zod";
import { registrationSchema } from "@/shared/contracts/registration.js";
import { userProfileSchema } from "@/shared/contracts/user.js";
import { ApiError, fieldInvalid } from "@/shared/http/error-envelope.js";
import { DB } from "@/database/database.module.js";
import type { Db } from "./users.repository.js";
import * as repo from "./users.repository.js";
import { hashPassword } from "./argon2.js";

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async register(body: unknown) {
    // body ที่แนบ role → ปฏิเสธชัดเจน (บทบาทอื่นสถาบันสร้างให้ — OC-1)
    if (body !== null && typeof body === "object" && "role" in body) {
      throw new ApiError(400, "role_not_allowed", "Only researchers can register; the role is assigned by the institution");
    }
    const parsed = registrationSchema.safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error as ZodError);
    const input = parsed.data;

    const [usernameInUse, emailInUse] = await Promise.all([
      repo.usernameTaken(this.db, input.username),
      repo.emailTaken(this.db, input.email),
    ]);
    if (usernameInUse.length > 0) throw new ApiError(409, "username_taken", "That username is already in use");
    if (emailInUse.length > 0) throw new ApiError(409, "email_taken", "Another account already uses this email");

    const passwordHash = await hashPassword(input.password);
    return repo.register(this.db, input, passwordHash); // controller แปลงเป็น session (สมัครแล้ว sign-in ทันที)
  }

  async isUsernameAvailable(username: string | undefined) {
    if (!username) throw new ApiError(400, "parameter_missing", "No username", "/username");
    const normalized = username.trim().toLowerCase();
    const taken = await repo.usernameTaken(this.db, normalized);
    return { object: "username_availability" as const, username: normalized, available: taken.length === 0 };
  }

  async getMe(username: string) {
    const row = (await repo.findByUsername(this.db, username)).at(0);
    if (row === undefined) throw new ApiError(401, "not_signed_in", "Sign in to continue");
    return repo.toUserResponse(row);
  }

  async patchMe(username: string, body: unknown) {
    const parsed = userProfileSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues.at(0);
      const code = issue?.path.includes("email") ? "email_invalid" : "name_required";
      throw new ApiError(400, code, issue?.message ?? "Invalid profile", issue ? `/${issue.path.join("/")}` : undefined);
    }
    const patch = parsed.data;
    const conflict = await repo.emailTaken(this.db, patch.email);
    if (conflict.length > 0 && conflict[0].username !== username) {
      throw new ApiError(409, "email_taken", "Another account already uses this email");
    }
    const row = (await repo.updateProfile(this.db, username, patch));
    if (row === undefined) throw new ApiError(401, "not_signed_in", "Sign in to continue");
    return repo.toUserResponse(row);
  }
}
