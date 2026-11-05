// dmps controller — บาง; HTTP boundary เท่านั้น
import { Body, Controller, Get, Inject, Param, Post, Put, Query } from "@nestjs/common";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { CurrentUser } from "@/features/auth/session.js";
import { DmpsService } from "./dmps.service.js";

@Controller("dmps")
export class DmpsController {
  constructor(@Inject(DmpsService) private readonly dmps: DmpsService) {}

  @Post()
  create(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    return this.dmps.create(user, body);
  }

  @Get()
  list(
    @CurrentUser() user: AccessClaims,
    @Query()
    query: {
      project_id?: string;
      archived?: string;
      status?: string | string[];
      q?: string;
      sort?: string;
      limit?: string;
      include?: string | string[];
    },
  ) {
    return this.dmps.list(user, query);
  }

  @Get(":dmpId")
  get(@CurrentUser() user: AccessClaims, @Param("dmpId") dmpId: string, @Query("include") include?: string | string[]) {
    const raw = include === undefined ? [] : Array.isArray(include) ? include : [include];
    const arr = raw.flatMap((v) => v.split(",")).map((v) => v.trim()).filter((v) => v.length > 0);
    return this.dmps.get(user, dmpId, arr);
  }

  @Put(":dmpId/draft")
  saveDraft(@CurrentUser() user: AccessClaims, @Param("dmpId") dmpId: string, @Body() body: unknown) {
    return this.dmps.saveDraft(user, dmpId, body);
  }

  @Post(":dmpId/draft/discard")
  discardDraft(@CurrentUser() user: AccessClaims, @Param("dmpId") dmpId: string) {
    return this.dmps.discardDraft(user, dmpId);
  }

  @Post(":dmpId/submit")
  submit(@CurrentUser() user: AccessClaims, @Param("dmpId") dmpId: string, @Body() body: unknown) {
    return this.dmps.submit(user, dmpId, body);
  }

  @Post(":dmpId/finalize")
  finalize(@CurrentUser() user: AccessClaims, @Param("dmpId") dmpId: string, @Body() body: unknown) {
    return this.dmps.finalize(user, dmpId, body);
  }
}
