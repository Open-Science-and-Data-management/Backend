// projects controller — บาง; HTTP boundary เท่านั้น
import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from "@nestjs/common";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { CurrentUser } from "@/features/auth/session.js";
import { ProjectsService } from "./projects.service.js";

@Controller("projects") // global AuthGuard ครอบ
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Post()
  create(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    return this.projects.create(user, body);
  }

  @Get()
  list(@CurrentUser() user: AccessClaims, @Query() query: { plan_mode?: string; limit?: string; starting_after?: string }) {
    return this.projects.list(user, query);
  }

  @Get(":projectId")
  get(@CurrentUser() user: AccessClaims, @Param("projectId") projectId: string) {
    return this.projects.get(user, projectId);
  }

  @Get(":projectId/members")
  listMembers(@CurrentUser() user: AccessClaims, @Param("projectId") projectId: string) {
    return this.projects.listMembers(user, projectId);
  }

  @Delete(":projectId")
  remove(@CurrentUser() user: AccessClaims, @Param("projectId") projectId: string) {
    return this.projects.remove(user, projectId);
  }
}
