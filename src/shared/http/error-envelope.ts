// Error envelope (ADR-0014) — Stripe-style; ทุก error ออกทาง filter เดียว
import { HttpException, type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";

export class ApiError extends HttpException {
  constructor(
    httpStatus: number,
    readonly code: string,
    message: string,
    readonly param?: string,
  ) {
    super({ error: { type: statusType(httpStatus), code, message, ...(param ? { param } : {}) } }, httpStatus);
  }
}

function statusType(status: number): string {
  if (status === 400) return "invalid_request_error";
  if (status === 401) return "authentication_error";
  if (status === 403) return "permission_error";
  if (status === 404) return "not_found_error";
  if (status === 409) return "conflict_error";
  if (status === 422) return "unprocessable_error";
  return "api_error";
}

/** 400 — body ผิดรูปผ่าน zod; แปลง issue แรกเป็น JSON pointer ใน `param` */
export function fieldInvalid(error: ZodError): ApiError {
  const issue = error.issues.at(0);
  const pointer = issue === undefined ? undefined : `/${issue.path.join("/")}`;
  const message = issue === undefined ? "Invalid request body" : issue.message;
  return new ApiError(400, "field_invalid", message, pointer);
}

@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) console.error(exception);
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const raw = typeof payload === "string" ? { message: payload } : (payload as Record<string, unknown>);
      const envelope = (typeof raw.error === "object" && raw.error !== null ? raw.error : raw) as Record<string, unknown>;
      const message = typeof envelope.message === "string" ? envelope.message : "Request failed";
      res.status(status).json({
        error: {
          type: statusType(status),
          code: typeof envelope.code === "string" ? envelope.code : statusType(status),
          ...(typeof envelope.param === "string" ? { param: envelope.param } : {}),
          message,
        },
      });
    } else {
      res.status(500).json({
        error: { type: "api_error", code: "internal_error", message: "Internal server error" },
      });
    }
  }
}
