// tasks controller — บาง; HTTP boundary เท่านั้น
import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query } from "@nestjs/common";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { CurrentUser } from "@/features/auth/session.js";
import { TasksService } from "./tasks.service.js";

@Controller()
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}

  @Get("tasks")
  list(
    @CurrentUser() user: AccessClaims,
    @Query() query: { project_id?: string; dmp_id?: string; status?: string; limit?: string; starting_after?: string },
  ) {
    return this.tasks.list(user, query);
  }

  @Post("tasks")
  create(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    return this.tasks.create(user, body);
  }

  @Post("dmps/:dmpId/tasks/generated")
  createGenerated(@CurrentUser() user: AccessClaims, @Param("dmpId") dmpId: string, @Body() body: unknown) {
    return this.tasks.createGenerated(user, dmpId, body);
  }

  @Patch("tasks/:taskId")
  update(@CurrentUser() user: AccessClaims, @Param("taskId") taskId: string, @Body() body: unknown) {
    return this.tasks.update(user, taskId, body);
  }

  @Post("tasks/:taskId/complete")
  complete(@CurrentUser() user: AccessClaims, @Param("taskId") taskId: string) {
    return this.tasks.complete(user, taskId);
  }

  @Post("tasks/:taskId/reopen")
  reopen(@CurrentUser() user: AccessClaims, @Param("taskId") taskId: string) {
    return this.tasks.reopen(user, taskId);
  }

  @Post("tasks/:taskId/cancel")
  cancel(@CurrentUser() user: AccessClaims, @Param("taskId") taskId: string) {
    return this.tasks.cancel(user, taskId);
  }

  @Delete("tasks/:taskId")
  remove(@CurrentUser() user: AccessClaims, @Param("taskId") taskId: string) {
    return this.tasks.remove(user, taskId);
  }

  @Post("tasks/:taskId/checklist")
  addChecklistItem(@CurrentUser() user: AccessClaims, @Param("taskId") taskId: string, @Body() body: unknown) {
    return this.tasks.addChecklistItem(user, taskId, body);
  }

  @Put("tasks/:taskId/checklist")
  replaceChecklist(@CurrentUser() user: AccessClaims, @Param("taskId") taskId: string, @Body() body: unknown) {
    return this.tasks.replaceChecklist(user, taskId, body);
  }

  @Patch("tasks/:taskId/checklist/:itemId")
  patchChecklistItem(
    @CurrentUser() user: AccessClaims,
    @Param("taskId") taskId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
  ) {
    return this.tasks.patchChecklistItem(user, taskId, itemId, body);
  }

  @Delete("tasks/:taskId/checklist/:itemId")
  deleteChecklistItem(
    @CurrentUser() user: AccessClaims,
    @Param("taskId") taskId: string,
    @Param("itemId") itemId: string,
  ) {
    return this.tasks.deleteChecklistItem(user, taskId, itemId);
  }

  @Put("tasks/:taskId/evidence")
  setEvidence(@CurrentUser() user: AccessClaims, @Param("taskId") taskId: string, @Body() body: unknown) {
    return this.tasks.setEvidence(user, taskId, body);
  }

  @Delete("tasks/:taskId/evidence")
  clearEvidence(@CurrentUser() user: AccessClaims, @Param("taskId") taskId: string) {
    return this.tasks.clearEvidence(user, taskId);
  }

  @Get("dmps/:dmpId/reopen-offers")
  listReopenOffers(@CurrentUser() user: AccessClaims, @Param("dmpId") dmpId: string) {
    return this.tasks.listReopenOffers(user, dmpId);
  }

  @Post("reopen-offers/:offerId/accept")
  acceptReopenOffer(@CurrentUser() user: AccessClaims, @Param("offerId") offerId: string, @Body() body: unknown) {
    return this.tasks.acceptReopenOffer(user, offerId, body);
  }

  @Post("reopen-offers/:offerId/dismiss")
  dismissReopenOffer(@CurrentUser() user: AccessClaims, @Param("offerId") offerId: string) {
    return this.tasks.dismissReopenOffer(user, offerId);
  }
}
